(() => {
  const EXPENSES_KEY = "budgetTracker.expenses";
  const RECURRING_KEY = "budgetTracker.recurring";
  const DARK_MODE_KEY = "budgetTracker.darkMode";

  // Fixed category recurring items fall back to when loaded from
  // localStorage written before categories were selectable on recurring
  // templates.
  const SAVINGS_CATEGORY = "Savings/Investing";

  const CATEGORIES = [
    "Food",
    "Housing",
    "Transportation",
    "Utilities",
    "Entertainment",
    "Health",
    "Shopping",
    "Other",
    SAVINGS_CATEGORY
  ];

  const FREQUENCIES = [
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "quarterly", label: "Quarterly" },
    { value: "yearly", label: "Yearly" }
  ];

  const darkModeToggle = document.getElementById("dark-mode-toggle");
  const darkModeIcon = document.getElementById("dark-mode-icon");

  const sectionNav = document.getElementById("section-nav");
  const budgetSection = document.getElementById("budget-section");
  const reviewSection = document.getElementById("review-section");
  const reviewPeriodToggle = document.getElementById("review-period-toggle");
  const reviewContent = document.getElementById("review-content");

  // Which Review sub-tab is showing. Not persisted to localStorage - each
  // fresh page load starts back on "week", per spec.
  let currentReviewPeriod = "week";

  const expenseForm = document.getElementById("expense-form");
  const expenseAmountInput = document.getElementById("expense-amount");
  const expenseCategoryInput = document.getElementById("expense-category");
  const expenseDateInput = document.getElementById("expense-date");
  const expenseNoteInput = document.getElementById("expense-note");
  const expenseList = document.getElementById("expense-list");
  const expenseEmpty = document.getElementById("expense-empty");
  const expenseTotal = document.getElementById("expense-total");
  const expenseSubmitBtn = document.getElementById("expense-submit-btn");
  const expenseCancelBtn = document.getElementById("expense-cancel-btn");

  const expenseRecurringCheckbox = document.getElementById("expense-recurring-checkbox");
  const recurringFrequencyRow = document.getElementById("recurring-frequency-row");
  const expenseRecurringFrequencyInput = document.getElementById("expense-recurring-frequency");

  const recurringList = document.getElementById("recurring-list");
  const recurringEmpty = document.getElementById("recurring-empty");

  const manageRecurringBtn = document.getElementById("manage-recurring-btn");
  const recurringModalOverlay = document.getElementById("recurring-modal-overlay");
  const recurringModalClose = document.getElementById("recurring-modal-close");

  // Non-null while the "Add" form is repurposed to edit an existing expense
  // (see startEditExpense below).
  let editingExpenseId = null;

  // Which recurring item (if any) is showing an inline edit form or delete
  // confirmation inside the "Manage Recurring" modal.
  let editingRecurringItemId = null;
  let confirmingDeleteRecurringId = null;

  let expenses = loadJson(EXPENSES_KEY, []);
  let recurringItems = loadJson(RECURRING_KEY, []);

  function loadJson(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function saveExpenses() {
    localStorage.setItem(EXPENSES_KEY, JSON.stringify(expenses));
  }

  function saveRecurring() {
    localStorage.setItem(RECURRING_KEY, JSON.stringify(recurringItems));
  }

  function generateId() {
    if (window.crypto && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  // Local-date (not UTC) "YYYY-MM-DD", so a saved date never shifts by a
  // day depending on the browser's timezone.
  function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function formatDateDisplay(isoDate) {
    const [year, month, day] = isoDate.split("-");
    return `${month}/${day}/${year}`;
  }

  function formatCurrency(amount) {
    return `$${amount.toFixed(2)}`;
  }

  function isoFromDate(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function shortDateLabel(d) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // Calendar-based (not rolling) periods, so "This Week" always means the
  // Sun-Sat week containing today, "This Quarter" the Jan/Apr/Jul/Oct
  // 3-month block containing today, etc. - what a budgeting review means
  // by those words, rather than "the last 7/30/90/365 days."
  function buildReviewPeriods(today) {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const quarter = Math.floor(today.getMonth() / 3);
    const quarterStart = new Date(today.getFullYear(), quarter * 3, 1);
    const quarterEnd = new Date(today.getFullYear(), quarter * 3 + 3, 0);

    const yearStart = new Date(today.getFullYear(), 0, 1);
    const yearEnd = new Date(today.getFullYear(), 11, 31);

    return [
      {
        key: "week",
        label: "This Week",
        start: weekStart,
        end: weekEnd,
        rangeLabel: `${shortDateLabel(weekStart)} – ${shortDateLabel(weekEnd)}, ${weekEnd.getFullYear()}`
      },
      {
        key: "month",
        label: "This Month",
        start: monthStart,
        end: monthEnd,
        rangeLabel: monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      },
      {
        key: "quarter",
        label: "This Quarter",
        start: quarterStart,
        end: quarterEnd,
        rangeLabel: `Q${quarter + 1} ${quarterStart.getFullYear()}`
      },
      {
        key: "year",
        label: "This Year",
        start: yearStart,
        end: yearEnd,
        rangeLabel: `${yearStart.getFullYear()}`
      }
    ];
  }

  function categoryClass(category) {
    if (category === SAVINGS_CATEGORY) {
      return "category-savings";
    }
    const normalized = CATEGORIES.includes(category) ? category : "Other";
    return "category-" + normalized.toLowerCase();
  }

  // Mirrors the .category-* background colors in style.css - kept as hex here
  // since SVG <path> fill can't read a CSS background-color.
  const CATEGORY_COLORS = {
    "category-food": "#d9822b",
    "category-housing": "#6a4fc9",
    "category-transportation": "#2f9e6e",
    "category-utilities": "#2b8fae",
    "category-entertainment": "#c14f8f",
    "category-health": "#d64545",
    "category-shopping": "#b98a2e",
    "category-other": "#6b7280",
    "category-savings": "#5a8f1f"
  };

  function categoryColor(category) {
    return CATEGORY_COLORS[categoryClass(category)] || CATEGORY_COLORS["category-other"];
  }

  function polarPoint(cx, cy, r, angleDeg) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function describePieSlice(cx, cy, r, startAngle, endAngle) {
    const start = polarPoint(cx, cy, r, startAngle);
    const end = polarPoint(cx, cy, r, endAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
  }

  const SVG_NS = "http://www.w3.org/2000/svg";

  function buildCategoryPie(sortedCategories, total) {
    const size = 200;
    const cx = size / 2;
    const cy = size / 2;
    const r = 92;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.setAttribute("class", "review-pie");
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      "Spending by category: " +
        sortedCategories
          .map(([category, amount]) => `${category} ${Math.round((amount / total) * 100)}%`)
          .join(", ")
    );

    if (sortedCategories.length === 1) {
      const [category, amount] = sortedCategories[0];
      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("cx", cx);
      circle.setAttribute("cy", cy);
      circle.setAttribute("r", r);
      circle.setAttribute("fill", categoryColor(category));
      circle.classList.add("pie-slice");
      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = `${category}: ${formatCurrency(amount)} (100%)`;
      circle.appendChild(title);
      svg.appendChild(circle);
      return svg;
    }

    let angle = 0;
    sortedCategories.forEach(([category, amount]) => {
      const pct = amount / total;
      const sweep = pct * 360;
      const startAngle = angle;
      const endAngle = angle + sweep;

      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", describePieSlice(cx, cy, r, startAngle, endAngle));
      path.setAttribute("fill", categoryColor(category));
      path.classList.add("pie-slice");

      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = `${category}: ${formatCurrency(amount)} (${Math.round(pct * 100)}%)`;
      path.appendChild(title);
      svg.appendChild(path);

      // Direct-label only slices big enough to hold a legible number.
      if (sweep >= 20) {
        const midAngle = startAngle + sweep / 2;
        const labelPoint = polarPoint(cx, cy, r * 0.64, midAngle);
        const label = document.createElementNS(SVG_NS, "text");
        label.setAttribute("x", labelPoint.x);
        label.setAttribute("y", labelPoint.y);
        label.setAttribute("class", "pie-slice-label");
        label.textContent = `${Math.round(pct * 100)}%`;
        svg.appendChild(label);
      }

      angle = endAngle;
    });

    return svg;
  }

  // Advances a "YYYY-MM-DD" date forward by one recurrence interval.
  function advanceDate(isoDate, frequency) {
    const d = new Date(isoDate + "T00:00:00");
    switch (frequency) {
      case "weekly":
        d.setDate(d.getDate() + 7);
        break;
      // No longer offered in the frequency dropdown, but still handled so
      // items created before this option was removed keep advancing.
      case "biweekly":
        d.setDate(d.getDate() + 14);
        break;
      case "monthly":
        d.setMonth(d.getMonth() + 1);
        break;
      case "quarterly":
        d.setMonth(d.getMonth() + 3);
        break;
      case "yearly":
        d.setFullYear(d.getFullYear() + 1);
        break;
    }
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function frequencyLabel(frequency) {
    const match = FREQUENCIES.find((f) => f.value === frequency);
    return match ? match.label : frequency;
  }

  // Fills a <select> with one <option> per {value, label} entry.
  function populateSelect(select, options) {
    options.forEach((opt) => {
      const option = document.createElement("option");
      option.value = opt.value !== undefined ? opt.value : opt;
      option.textContent = opt.label !== undefined ? opt.label : opt;
      select.appendChild(option);
    });
  }

  // Logs any recurring contribution whose next due date has arrived (or
  // passed while the app was closed) as a Main-tab expense entry, then
  // advances that item's due date past today. Only ever moves forward from
  // each item's own nextDueDate - which is set at creation time to "today"
  // at the earliest - so a recurring item never backfills entries for
  // dates before it was added.
  function processRecurringDue() {
    const today = todayIso();
    let changed = false;

    recurringItems.forEach((item) => {
      if (item.paused) {
        return;
      }
      while (item.nextDueDate <= today) {
        expenses.push({
          id: generateId(),
          amount: item.amount,
          category: item.category || SAVINGS_CATEGORY,
          date: item.nextDueDate,
          note: item.label,
          recurringId: item.id
        });
        item.nextDueDate = advanceDate(item.nextDueDate, item.frequency);
        changed = true;
      }
    });

    if (changed) {
      saveExpenses();
      saveRecurring();
    }
  }

  function renderExpenses() {
    expenseList.innerHTML = "";

    const sorted = [...expenses].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    sorted.forEach((expense) => {
      const li = document.createElement("li");
      li.classList.add("entry-row");

      const main = document.createElement("div");
      main.classList.add("entry-main");

      const top = document.createElement("div");
      top.classList.add("entry-top");

      const badge = document.createElement("span");
      badge.classList.add("category-badge", categoryClass(expense.category));
      badge.textContent = expense.category;
      top.appendChild(badge);

      if (expense.recurringId) {
        const recurBadge = document.createElement("span");
        recurBadge.classList.add("recurring-badge");
        recurBadge.textContent = "🔁 auto";
        top.appendChild(recurBadge);
      }

      main.appendChild(top);

      if (expense.note) {
        const note = document.createElement("div");
        note.classList.add("entry-note");
        note.textContent = expense.note;
        main.appendChild(note);
      }

      const meta = document.createElement("div");
      meta.classList.add("entry-meta");
      meta.textContent = formatDateDisplay(expense.date);
      main.appendChild(meta);

      li.appendChild(main);

      const amount = document.createElement("span");
      amount.classList.add("entry-amount");
      amount.textContent = formatCurrency(expense.amount);
      li.appendChild(amount);

      const actions = document.createElement("div");
      actions.classList.add("entry-actions");

      if (expense.recurringId) {
        // Auto-logged recurring occurrences are edited via their template,
        // so future occurrences stay in sync.
        const template = recurringItems.find((r) => r.id === expense.recurringId);
        if (template) {
          const editBtn = document.createElement("button");
          editBtn.classList.add("entry-edit");
          editBtn.textContent = "✎";
          editBtn.title = "Edit recurring contribution";
          editBtn.addEventListener("click", () => {
            openRecurringModal(template.id);
          });
          actions.appendChild(editBtn);
        }
      } else {
        const editBtn = document.createElement("button");
        editBtn.classList.add("entry-edit");
        editBtn.textContent = "✎";
        editBtn.title = "Edit entry";
        editBtn.addEventListener("click", () => {
          startEditExpense(expense);
        });
        actions.appendChild(editBtn);
      }

      const deleteBtn = document.createElement("button");
      deleteBtn.classList.add("entry-delete");
      deleteBtn.textContent = "✕";
      deleteBtn.title = "Delete entry";
      deleteBtn.addEventListener("click", () => {
        if (expense.id === editingExpenseId) {
          cancelEditExpense();
        }
        expenses = expenses.filter((e) => e.id !== expense.id);
        saveExpenses();
        renderExpenses();
        renderReview();
      });
      actions.appendChild(deleteBtn);

      li.appendChild(actions);

      expenseList.appendChild(li);
    });

    expenseEmpty.hidden = sorted.length > 0;

    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    expenseTotal.textContent = formatCurrency(total);
  }

  // Builds a small form (styled like the Add Entry form) for editing a
  // recurring item's amount, category, and description in place within the
  // "Manage Recurring" modal. Frequency and dates aren't editable here.
  function buildRecurringEditForm(item) {
    const form = document.createElement("form");
    form.classList.add("recurring-edit-form");

    const row1 = document.createElement("div");
    row1.classList.add("field-row");

    const amountField = document.createElement("div");
    amountField.classList.add("field");
    const amountLabel = document.createElement("label");
    amountLabel.textContent = "Amount";
    amountField.appendChild(amountLabel);
    const amountWrap = document.createElement("div");
    amountWrap.classList.add("amount-input-wrap");
    const dollarSign = document.createElement("span");
    dollarSign.textContent = "$";
    amountWrap.appendChild(dollarSign);
    const amountInput = document.createElement("input");
    amountInput.type = "number";
    amountInput.min = "0.01";
    amountInput.step = "0.01";
    amountInput.required = true;
    amountInput.value = item.amount;
    amountWrap.appendChild(amountInput);
    amountField.appendChild(amountWrap);
    row1.appendChild(amountField);

    const categoryField = document.createElement("div");
    categoryField.classList.add("field");
    const categoryLabel = document.createElement("label");
    categoryLabel.textContent = "Category";
    categoryField.appendChild(categoryLabel);
    const categorySelect = document.createElement("select");
    populateSelect(categorySelect, CATEGORIES);
    categorySelect.value = item.category || SAVINGS_CATEGORY;
    categoryField.appendChild(categorySelect);
    row1.appendChild(categoryField);

    form.appendChild(row1);

    const row2 = document.createElement("div");
    row2.classList.add("field-row");

    const dateField = document.createElement("div");
    dateField.classList.add("field");
    const dateLabel = document.createElement("label");
    dateLabel.textContent = "Date";
    dateField.appendChild(dateLabel);
    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.required = true;
    dateInput.value = item.startDate;
    dateField.appendChild(dateInput);
    row2.appendChild(dateField);

    const noteField = document.createElement("div");
    noteField.classList.add("field");
    const noteLabel = document.createElement("label");
    noteLabel.textContent = "Description";
    noteField.appendChild(noteLabel);
    const noteInput = document.createElement("input");
    noteInput.type = "text";
    noteInput.required = true;
    noteInput.value = item.label;
    noteField.appendChild(noteInput);
    row2.appendChild(noteField);
    form.appendChild(row2);

    const formActions = document.createElement("div");
    formActions.classList.add("form-actions");

    const saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.classList.add("btn-primary");
    saveBtn.textContent = "Save";
    formActions.appendChild(saveBtn);

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.classList.add("btn-secondary");
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => {
      editingRecurringItemId = null;
      renderRecurring();
    });
    formActions.appendChild(cancelBtn);

    form.appendChild(formActions);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const amount = parseFloat(amountInput.value);
      if (isNaN(amount) || amount <= 0) {
        return;
      }
      const description = noteInput.value.trim();
      if (!description) {
        return;
      }
      const date = dateInput.value;
      if (!date) {
        return;
      }
      // Never backdate: if the date changed to a new past date, the next
      // logged occurrence still lands on today - only occurrences from
      // here forward get auto-logged.
      if (date !== item.startDate) {
        const today = todayIso();
        item.nextDueDate = date > today ? date : today;
      }
      item.amount = amount;
      item.category = categorySelect.value;
      item.label = description;
      item.startDate = date;
      saveRecurring();
      editingRecurringItemId = null;
      processRecurringDue();
      renderRecurring();
      renderExpenses();
      renderReview();
    });

    return form;
  }

  function renderRecurring() {
    recurringList.innerHTML = "";

    const sorted = [...recurringItems].sort((a, b) => (a.nextDueDate < b.nextDueDate ? -1 : 1));

    sorted.forEach((item) => {
      const li = document.createElement("li");
      li.classList.add("entry-row");

      if (confirmingDeleteRecurringId === item.id) {
        li.classList.add("confirm-row");

        const text = document.createElement("span");
        text.classList.add("confirm-text");
        text.textContent = `Delete "${item.label}"?`;
        li.appendChild(text);

        const confirmActions = document.createElement("div");
        confirmActions.classList.add("confirm-actions");

        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.classList.add("btn-secondary", "btn-small");
        cancelBtn.textContent = "Cancel";
        cancelBtn.addEventListener("click", () => {
          confirmingDeleteRecurringId = null;
          renderRecurring();
        });
        confirmActions.appendChild(cancelBtn);

        const confirmDeleteBtn = document.createElement("button");
        confirmDeleteBtn.type = "button";
        confirmDeleteBtn.classList.add("btn-danger", "btn-small");
        confirmDeleteBtn.textContent = "Delete";
        confirmDeleteBtn.addEventListener("click", () => {
          recurringItems = recurringItems.filter((r) => r.id !== item.id);
          confirmingDeleteRecurringId = null;
          if (editingRecurringItemId === item.id) {
            editingRecurringItemId = null;
          }
          saveRecurring();
          renderRecurring();
          renderExpenses();
        });
        confirmActions.appendChild(confirmDeleteBtn);

        li.appendChild(confirmActions);
        recurringList.appendChild(li);
        return;
      }

      if (editingRecurringItemId === item.id) {
        li.classList.add("edit-row");
        const form = buildRecurringEditForm(item);
        li.appendChild(form);
        recurringList.appendChild(li);
        form.querySelector("input[type='number']").focus();
        return;
      }

      if (item.paused) {
        li.classList.add("paused");
      }

      const main = document.createElement("div");
      main.classList.add("entry-main");

      const top = document.createElement("div");
      top.classList.add("entry-top");

      const itemCategory = item.category || SAVINGS_CATEGORY;
      const badge = document.createElement("span");
      badge.classList.add("category-badge", categoryClass(itemCategory));
      badge.textContent = itemCategory;
      top.appendChild(badge);

      if (item.paused) {
        const pausedBadge = document.createElement("span");
        pausedBadge.classList.add("paused-badge");
        pausedBadge.textContent = "Paused";
        top.appendChild(pausedBadge);
      }

      main.appendChild(top);

      const note = document.createElement("div");
      note.classList.add("entry-note");
      note.textContent = item.label;
      main.appendChild(note);

      const details = document.createElement("div");
      details.classList.add("recurring-item-details");
      details.textContent = `${frequencyLabel(item.frequency)} · Next: ${formatDateDisplay(item.nextDueDate)}`;
      main.appendChild(details);

      li.appendChild(main);

      const amount = document.createElement("span");
      amount.classList.add("entry-amount");
      amount.textContent = formatCurrency(item.amount);
      li.appendChild(amount);

      const actions = document.createElement("div");
      actions.classList.add("entry-actions");

      const editBtn = document.createElement("button");
      editBtn.classList.add("entry-edit");
      editBtn.textContent = "✎";
      editBtn.title = "Edit recurring contribution";
      editBtn.addEventListener("click", () => {
        confirmingDeleteRecurringId = null;
        editingRecurringItemId = item.id;
        renderRecurring();
      });
      actions.appendChild(editBtn);

      const pauseBtn = document.createElement("button");
      pauseBtn.classList.add("entry-pause");
      pauseBtn.textContent = item.paused ? "▶" : "⏸";
      pauseBtn.title = item.paused ? "Resume recurring contribution" : "Pause recurring contribution";
      pauseBtn.addEventListener("click", () => {
        item.paused = !item.paused;
        // Resuming clamps the next due date up to today instead of
        // catching up on every occurrence missed while paused.
        if (!item.paused) {
          const today = todayIso();
          if (item.nextDueDate < today) {
            item.nextDueDate = today;
          }
        }
        saveRecurring();
        renderRecurring();
      });
      actions.appendChild(pauseBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.classList.add("entry-delete");
      deleteBtn.textContent = "✕";
      deleteBtn.title = "Delete recurring contribution";
      deleteBtn.addEventListener("click", () => {
        editingRecurringItemId = null;
        confirmingDeleteRecurringId = item.id;
        renderRecurring();
      });
      actions.appendChild(deleteBtn);

      li.appendChild(actions);

      recurringList.appendChild(li);
    });

    recurringEmpty.hidden = sorted.length > 0;
  }

  function openRecurringModal(editItemId) {
    editingRecurringItemId = editItemId || null;
    confirmingDeleteRecurringId = null;
    renderRecurring();
    recurringModalOverlay.hidden = false;
    document.body.classList.add("modal-open");
    document.addEventListener("keydown", handleRecurringModalKeydown);
    if (!editItemId) {
      recurringModalClose.focus();
    }
  }

  function closeRecurringModal() {
    recurringModalOverlay.hidden = true;
    document.body.classList.remove("modal-open");
    document.removeEventListener("keydown", handleRecurringModalKeydown);
    editingRecurringItemId = null;
    confirmingDeleteRecurringId = null;
  }

  function handleRecurringModalKeydown(event) {
    if (event.key === "Escape") {
      closeRecurringModal();
    }
  }

  manageRecurringBtn.addEventListener("click", () => openRecurringModal());
  recurringModalClose.addEventListener("click", closeRecurringModal);
  recurringModalOverlay.addEventListener("click", (event) => {
    if (event.target === recurringModalOverlay) {
      closeRecurringModal();
    }
  });

  function renderReview() {
    reviewContent.innerHTML = "";

    const today = new Date();
    const periods = buildReviewPeriods(today);
    const period = periods.find((p) => p.key === currentReviewPeriod) || periods[0];

    const startIso = isoFromDate(period.start);
    const endIso = isoFromDate(period.end);
    const inRange = expenses.filter((e) => e.date >= startIso && e.date <= endIso);
    const total = inRange.reduce((sum, e) => sum + e.amount, 0);

    const byCategory = {};
    inRange.forEach((e) => {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    });
    const sortedCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

    const card = document.createElement("div");
    card.classList.add("card", "review-card");

    const header = document.createElement("div");
    header.classList.add("review-card-header");

    const title = document.createElement("h3");
    title.textContent = period.label;
    header.appendChild(title);

    const range = document.createElement("span");
    range.classList.add("review-range");
    range.textContent = period.rangeLabel;
    header.appendChild(range);

    card.appendChild(header);

    const totalRow = document.createElement("div");
    totalRow.classList.add("total-row");
    const totalLabel = document.createElement("span");
    totalLabel.textContent = "Total";
    const totalValue = document.createElement("span");
    totalValue.textContent = formatCurrency(total);
    totalRow.appendChild(totalLabel);
    totalRow.appendChild(totalValue);
    card.appendChild(totalRow);

    if (sortedCategories.length === 0) {
      const empty = document.createElement("div");
      empty.classList.add("list-empty-state");

      const icon = document.createElement("div");
      icon.classList.add("list-empty-icon");
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "📭";
      empty.appendChild(icon);

      const message = document.createElement("p");
      message.classList.add("empty-state");
      message.textContent = `No spending recorded ${period.label.toLowerCase()}.`;
      empty.appendChild(message);

      card.appendChild(empty);
    } else {
      const pieWrap = document.createElement("div");
      pieWrap.classList.add("review-pie-wrap");
      pieWrap.appendChild(buildCategoryPie(sortedCategories, total));
      card.appendChild(pieWrap);

      const breakdownList = document.createElement("ul");
      breakdownList.classList.add("breakdown-list");

      sortedCategories.forEach(([category, amount]) => {
        const row = document.createElement("li");
        row.classList.add("breakdown-row");

        const badge = document.createElement("span");
        badge.classList.add("category-badge", categoryClass(category));
        badge.textContent = category;
        row.appendChild(badge);

        const pct = Math.round((amount / total) * 100);
        const amountSpan = document.createElement("span");
        amountSpan.classList.add("breakdown-amount");
        amountSpan.textContent = `${formatCurrency(amount)} · ${pct}%`;
        row.appendChild(amountSpan);

        breakdownList.appendChild(row);
      });

      card.appendChild(breakdownList);
    }

    reviewContent.appendChild(card);
  }

  function updateRecurringFrequencyVisibility() {
    recurringFrequencyRow.hidden = !expenseRecurringCheckbox.checked;
  }

  function startEditExpense(expense) {
    editingExpenseId = expense.id;
    expenseAmountInput.value = expense.amount;
    expenseCategoryInput.value = expense.category;
    expenseDateInput.value = expense.date;
    expenseNoteInput.value = expense.note || "";
    expenseRecurringCheckbox.checked = false;
    // A one-time entry can't become recurring (or vice versa) via edit -
    // delete and re-add with the checkbox set instead.
    expenseRecurringCheckbox.disabled = true;
    updateRecurringFrequencyVisibility();
    expenseSubmitBtn.textContent = "Update Expense";
    expenseCancelBtn.hidden = false;
    expenseAmountInput.focus();
  }

  function cancelEditExpense() {
    editingExpenseId = null;
    expenseForm.reset();
    expenseDateInput.value = todayIso();
    expenseRecurringCheckbox.disabled = false;
    updateRecurringFrequencyVisibility();
    expenseSubmitBtn.textContent = "Add Entry";
    expenseCancelBtn.hidden = true;
  }

  expenseForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const amount = parseFloat(expenseAmountInput.value);
    if (isNaN(amount) || amount <= 0) {
      return;
    }

    const category = expenseCategoryInput.value;
    const date = expenseDateInput.value || todayIso();
    const description = expenseNoteInput.value.trim();

    if (editingExpenseId) {
      const target = expenses.find((e) => e.id === editingExpenseId);
      if (target) {
        target.amount = amount;
        target.category = category;
        target.date = date;
        target.note = description;
      }
      saveExpenses();
    } else if (expenseRecurringCheckbox.checked) {
      if (!description) {
        return;
      }
      const today = todayIso();
      const nextDueDate = date > today ? date : today;
      recurringItems.push({
        id: generateId(),
        label: description,
        amount,
        category,
        frequency: expenseRecurringFrequencyInput.value,
        startDate: date,
        nextDueDate
      });
      saveRecurring();
      processRecurringDue();
    } else {
      expenses.push({
        id: generateId(),
        amount,
        category,
        date,
        note: description
      });
      saveExpenses();
    }

    renderExpenses();
    renderRecurring();
    renderReview();

    cancelEditExpense();
  });

  expenseRecurringCheckbox.addEventListener("change", updateRecurringFrequencyVisibility);

  expenseCancelBtn.addEventListener("click", cancelEditExpense);

  sectionNav.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-section]");
    if (!button) {
      return;
    }

    const section = button.dataset.section;

    sectionNav.querySelectorAll("button").forEach((btn) => {
      const isActive = btn === button;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", String(isActive));
    });

    budgetSection.hidden = section !== "budget";
    reviewSection.hidden = section !== "review";
    document.body.dataset.activeSection = section;

    if (section === "review") {
      renderReview(); // recompute so "This Week" etc. stay correct if the day rolled over while the tab was open
    }
  });

  reviewPeriodToggle.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-period]");
    if (!button) {
      return;
    }

    currentReviewPeriod = button.dataset.period;

    reviewPeriodToggle.querySelectorAll("button").forEach((btn) => {
      const isActive = btn === button;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", String(isActive));
    });

    renderReview();
  });

  function applyDarkMode(isDark) {
    document.documentElement.classList.toggle("dark", isDark);
    darkModeToggle.setAttribute("aria-pressed", String(isDark));
    darkModeIcon.textContent = isDark ? "☀️" : "🌙";
  }

  function initDarkMode() {
    const stored = localStorage.getItem(DARK_MODE_KEY);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = stored === null ? prefersDark : stored === "true";
    applyDarkMode(isDark);
  }

  darkModeToggle.addEventListener("click", () => {
    const isDark = !document.documentElement.classList.contains("dark");
    applyDarkMode(isDark);
    localStorage.setItem(DARK_MODE_KEY, String(isDark));
  });

  populateSelect(expenseCategoryInput, CATEGORIES);
  populateSelect(expenseRecurringFrequencyInput, FREQUENCIES);

  expenseDateInput.value = todayIso();

  initDarkMode();
  processRecurringDue();
  renderExpenses();
  renderRecurring();
  renderReview();
})();

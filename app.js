const SUITS = [
  { key: "spades", label: "Spades", icon: "♠", color: "black" },
  { key: "hearts", label: "Hearts", icon: "♥", color: "red" },
];

const RANKS_ASC = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const RANK_TO_VALUE = Object.fromEntries(RANKS_ASC.map((rank, idx) => [rank, idx]));
const SETTINGS_KEY = "spider-solitaire-settings";

const tableauEl = document.querySelector("#tableau");
const stockButton = document.querySelector('[data-action="deal"]');
const foundationCountEl = document.querySelector("#foundationCount");
const stockCountEl = document.querySelector("#stockCount");
const undoButton = document.querySelector("#undoButton");
const settingsToggleEl = document.querySelector("#toggleUndo");
const settingsModal = document.querySelector("#settingsModal");
const guideModal = document.querySelector("#guideModal");
const toolbarButtons = document.querySelectorAll(".toolbar-button");

const defaultSettings = { undoEnabled: true };
const state = {
  tableau: [],
  stock: [],
  foundations: [],
  history: [],
  selection: null,
  settings: loadSettings(),
};

function loadSettings() {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (!saved) return { ...defaultSettings };
    return { ...defaultSettings, ...JSON.parse(saved) };
  } catch (err) {
    console.warn("Failed to read settings, using defaults", err);
    return { ...defaultSettings };
  }
}

function persistSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch (err) {
    console.warn("Unable to persist settings", err);
  }
}

function createDeck() {
  const deck = [];
  let id = 0;
  // Two suits, four of each card per suit -> 104 cards total (2 suits * 4 decks * 13 ranks).
  for (let copy = 0; copy < 4; copy += 1) {
    SUITS.forEach((suit) => {
      RANKS_ASC.slice()
        .reverse()
        .forEach((rank) => {
          deck.push({
            id: id += 1,
            suit: suit.key,
            suitIcon: suit.icon,
            color: suit.color,
            rank,
            faceUp: false,
          });
        });
    });
  }
  return deck;
}

function shuffle(cards) {
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
}

function setupNewGame() {
  state.selection = null;
  state.history = [];
  state.foundations = [];
  state.tableau = Array.from({ length: 10 }, () => []);
  state.stock = createDeck();
  shuffle(state.stock);

  for (let col = 0; col < 10; col += 1) {
    const cardsToDeal = col < 4 ? 6 : 5;
    for (let i = 0; i < cardsToDeal; i += 1) {
      const card = state.stock.pop();
      card.faceUp = i === cardsToDeal - 1;
      state.tableau[col].push(card);
    }
  }
  updateUI();
}

function updateUI() {
  tableauEl.replaceChildren(...state.tableau.map((column, colIndex) => renderColumn(column, colIndex)));
  foundationCountEl.textContent = `${state.foundations.length} / 8`;
  const dealsLeft = Math.floor(state.stock.length / 10);
  stockCountEl.textContent = String(dealsLeft);
  stockButton.disabled = state.stock.length === 0;
  stockButton.title = dealsLeft
    ? `${dealsLeft} deal${dealsLeft === 1 ? "" : "s"} remaining`
    : "No deals remaining";

  undoButton.disabled = !state.settings.undoEnabled || state.history.length === 0;
  toggleToolbarActive();
  updateUndoToggle();
}

function renderColumn(column, colIndex) {
  const columnEl = document.createElement("div");
  columnEl.className = "column";
  columnEl.dataset.column = String(colIndex);
  columnEl.addEventListener("click", (event) => {
    if (event.target !== columnEl) return;
    handleColumnClick(colIndex);
  });

  const highlight = shouldHighlight(colIndex);

  if (column.length === 0) {
    const placeholder = document.createElement("div");
    placeholder.className = "pile-placeholder";
    placeholder.textContent = "Empty";
    columnEl.appendChild(placeholder);
    if (highlight) {
      columnEl.classList.add("is-target");
    }
    return columnEl;
  }

  column.forEach((card, cardIndex) => {
    const cardEl = renderCard(card, colIndex, cardIndex, highlight && cardIndex === column.length - 1);
    columnEl.appendChild(cardEl);
  });

  if (highlight) {
    columnEl.classList.add("is-target");
  }

  return columnEl;
}

function renderCard(card, columnIndex, cardIndex, isTargetTop = false) {
  const cardEl = document.createElement("div");
  cardEl.className = `card ${card.faceUp ? "face-up" : "face-down"}${card.color === "red" ? " red" : ""}`;
  cardEl.dataset.column = String(columnIndex);
  cardEl.dataset.index = String(cardIndex);

  if (!card.faceUp) {
    cardEl.textContent = "Spider";
  } else {
    cardEl.appendChild(renderCorner(card.rank, card.suitIcon));

    const center = document.createElement("span");
    center.className = "suit";
    center.textContent = card.suitIcon;
    cardEl.appendChild(center);

    cardEl.appendChild(renderCorner(card.rank, card.suitIcon, true));
  }

  if (state.selection && state.selection.column === columnIndex && state.selection.index === cardIndex) {
    cardEl.classList.add("is-selected");
  }
  if (isTargetTop) {
    cardEl.classList.add("is-valid-target");
  }

  cardEl.addEventListener("click", (event) => {
    event.stopPropagation();
    handleCardClick(columnIndex, cardIndex);
  });

  return cardEl;
}

function renderCorner(rank, suitIcon, flipped = false) {
  const corner = document.createElement("span");
  corner.className = `corner${flipped ? " bottom" : ""}`;

  const topRank = document.createElement("span");
  topRank.className = "rank";
  topRank.textContent = rank;

  const topSuit = document.createElement("span");
  topSuit.textContent = suitIcon;

  corner.appendChild(topRank);
  corner.appendChild(topSuit);
  return corner;
}

function handleColumnClick(columnIndex) {
  if (!state.selection) return;
  attemptMove(state.selection.column, state.selection.index, columnIndex);
}

function handleCardClick(columnIndex, cardIndex) {
  const column = state.tableau[columnIndex];
  const card = column[cardIndex];
  if (!card.faceUp) return;

  if (!state.selection) {
    if (!isMovableStack(column, cardIndex)) return;
    state.selection = { column: columnIndex, index: cardIndex };
  } else if (state.selection.column === columnIndex && state.selection.index === cardIndex) {
    state.selection = null;
  } else {
    attemptMove(state.selection.column, state.selection.index, columnIndex);
  }
  updateUI();
}

function attemptMove(fromColumnIndex, fromCardIndex, toColumnIndex) {
  if (fromColumnIndex === toColumnIndex) {
    state.selection = null;
    updateUI();
    return;
  }

  const fromColumn = state.tableau[fromColumnIndex];
  const toColumn = state.tableau[toColumnIndex];

  if (!fromColumn) return;

  const movingStack = fromColumn.slice(fromCardIndex);
  if (!isValidStack(movingStack)) return;

  if (!isValidDestination(movingStack[0], toColumn)) {
    state.selection = null;
    updateUI();
    return;
  }

  const moveAction = {
    type: "move",
    fromColumn: fromColumnIndex,
    toColumn: toColumnIndex,
    fromIndex: fromCardIndex,
    cards: [...movingStack],
    flippedCards: [],
    clearedRun: null,
  };

  // Execute move
  toColumn.push(...fromColumn.splice(fromCardIndex));

  const flipped = revealTopCard(fromColumnIndex);
  if (flipped) {
    moveAction.flippedCards.push({ card: flipped, column: fromColumnIndex });
  }

  const cleared = tryCompleteRun(toColumnIndex);
  if (cleared) {
    moveAction.clearedRun = {
      column: toColumnIndex,
      cards: cleared.cards,
      flip: cleared.flip,
    };
  }

  state.history.push(moveAction);
  state.selection = null;
  updateUI();
}

function revealTopCard(columnIndex) {
  const column = state.tableau[columnIndex];
  if (!column || column.length === 0) return null;
  const top = column[column.length - 1];
  if (!top.faceUp) {
    top.faceUp = true;
    return top;
  }
  return null;
}

function hideCard(card) {
  if (card) {
    card.faceUp = false;
  }
}

function tryCompleteRun(columnIndex) {
  const column = state.tableau[columnIndex];
  if (!column || column.length < 13) return null;
  const tail = column.slice(-13);
  if (!isValidRun(tail)) return null;

  const removed = column.splice(column.length - 13, 13);
  state.foundations.push(removed);

  const flip = revealTopCard(columnIndex);

  return { cards: removed, flip: flip ? { column: columnIndex, card: flip } : null };
}

function isValidRun(cards) {
  if (cards.length !== 13) return false;
  const { suit } = cards[0];
  for (let i = 0; i < cards.length - 1; i += 1) {
    if (cards[i].suit !== suit) return false;
    if (rankValue(cards[i].rank) !== rankValue(cards[i + 1].rank) + 1) return false;
  }
  return rankValue(cards[cards.length - 1].rank) === 0;
}

function isMovableStack(column, startIndex) {
  const stack = column.slice(startIndex);
  return stack.length > 0 && stack.every((card) => card.faceUp) && isValidStack(stack);
}

function isValidStack(stack) {
  if (stack.length === 0) return false;
  for (let i = 0; i < stack.length - 1; i += 1) {
    const current = stack[i];
    const next = stack[i + 1];
    if (current.suit !== next.suit) return false;
    if (rankValue(current.rank) !== rankValue(next.rank) + 1) return false;
  }
  return true;
}

function isValidDestination(card, column) {
  if (column.length === 0) {
    return true;
  }
  const top = column[column.length - 1];
  if (!top.faceUp) return false;
  return rankValue(top.rank) === rankValue(card.rank) + 1;
}

function rankValue(rank) {
  return RANK_TO_VALUE[rank];
}

function shouldHighlight(columnIndex) {
  if (!state.selection) return false;
  if (columnIndex === state.selection.column) return false;
  const fromColumn = state.tableau[state.selection.column];
  if (!fromColumn) return false;
  const stack = fromColumn.slice(state.selection.index);
  if (!isValidStack(stack)) return false;
  const targetColumn = state.tableau[columnIndex];
  return isValidDestination(stack[0], targetColumn);
}

function dealRow() {
  if (state.stock.length < 10) return;
  const cannotDeal = state.tableau.some((column) => column.length === 0);
  if (cannotDeal) {
    alert("Deal is only allowed when every column has at least one card.");
    return;
  }

  const dealt = [];
  for (let columnIndex = 0; columnIndex < 10; columnIndex += 1) {
    const card = state.stock.pop();
    card.faceUp = true;
    state.tableau[columnIndex].push(card);
    dealt.push({ column: columnIndex, card });
  }

  const clearedRuns = [];
  for (let columnIndex = 0; columnIndex < 10; columnIndex += 1) {
    const cleared = tryCompleteRun(columnIndex);
    if (cleared) {
      clearedRuns.push({
        column: columnIndex,
        cards: cleared.cards,
        flip: cleared.flip,
      });
    }
  }

  state.history.push({
    type: "deal",
    dealt,
    clearedRuns,
  });

  state.selection = null;
  updateUI();
}

function undo() {
  if (!state.settings.undoEnabled) return;
  const action = state.history.pop();
  if (!action) return;

  if (action.type === "move") {
    undoMove(action);
  } else if (action.type === "deal") {
    undoDeal(action);
  }
  state.selection = null;
  updateUI();
}

function undoMove(action) {
  const { fromColumn, toColumn, fromIndex, cards, flippedCards, clearedRun } = action;
  const destination = state.tableau[toColumn];
  destination.splice(destination.length - cards.length, cards.length);
  const origin = state.tableau[fromColumn];
  origin.splice(fromIndex, 0, ...cards);

  if (clearedRun) {
    state.foundations.pop();
    const targetColumn = state.tableau[clearedRun.column];
    targetColumn.push(...clearedRun.cards);
    if (clearedRun.flip) {
      hideCard(clearedRun.flip.card);
    }
  }

  flippedCards.forEach(({ card }) => hideCard(card));
}

function undoDeal(action) {
  const { dealt, clearedRuns } = action;

  clearedRuns.slice().reverse().forEach((run) => {
    state.foundations.pop();
    const column = state.tableau[run.column];
    column.push(...run.cards);
    if (run.flip) {
      hideCard(run.flip.card);
    }
  });

  dealt
    .slice()
    .reverse()
    .forEach(({ column, card }) => {
      const columnCards = state.tableau[column];
      const removed = columnCards.pop();
      if (removed !== card) {
        columnCards.push(removed);
        throw new Error("Undo mismatch when rewinding deal.");
      }
      hideCard(card);
      state.stock.push(card);
    });
}

function toggleToolbarActive() {
  toolbarButtons.forEach((button) => {
    const action = button.dataset.action;
    if (action === "undo") {
      button.disabled = undoButton.disabled;
    }
  });
}

function updateUndoToggle() {
  settingsToggleEl.checked = state.settings.undoEnabled;
}

function openDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

function closeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}

function handleToolbar(event) {
  const button = event.currentTarget;
  const action = button.dataset.action;
  if (!action) return;

  switch (action) {
    case "settings":
      openDialog(settingsModal);
      break;
    case "guide":
      openDialog(guideModal);
      break;
    case "new":
      if (confirm("Start a new game? Current progress will be lost.")) {
        setupNewGame();
      }
      break;
    case "undo":
      undo();
      break;
    default:
      break;
  }
}

stockButton.addEventListener("click", () => dealRow());
undoButton.addEventListener("click", () => undo());
toolbarButtons.forEach((button) => {
  if (button.dataset.action === "undo") return;
  button.addEventListener("click", handleToolbar);
});
settingsToggleEl.addEventListener("change", (event) => {
  state.settings.undoEnabled = event.target.checked;
  persistSettings();
  updateUI();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (guideModal.open) {
      closeDialog(guideModal);
    } else if (settingsModal.open) {
      closeDialog(settingsModal);
    } else if (state.selection) {
      state.selection = null;
      updateUI();
    }
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    undo();
  } else if (event.key === " ") {
    dealRow();
  }
});

for (const dialog of [guideModal, settingsModal]) {
  dialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog(dialog);
  });
}

setupNewGame();

const STORAGE_KEY = "descontinuado-terminal-state";
const RESPONSE_DB_URL = "/data/responses.json";
const MESSAGE_DELAY = 350;
const TYPE_SPEED_RANGE = [14, 28];
const DELETE_SPEED_RANGE = [20, 34];

const state = {
  db: null,
  memory: loadMemory(),
  isReplying: false,
};

const elements = {
  chatLog: document.querySelector("#chat-log"),
  chatForm: document.querySelector("#chat-form"),
  chatInput: document.querySelector("#chat-input"),
  template: document.querySelector("#message-template"),
};

bootstrap().catch((error) => {
  console.error(error);
  appendMessage({
    author: "assistant",
    label: "SISTEMA",
    text: "Falha ao carregar o banco de dados. Verifique `data/responses.json`.",
    liveText: "Falha ao carregar o banco de dados. Verifique `data/responses.json`.",
  });
});

async function bootstrap() {
  const response = await fetch(RESPONSE_DB_URL, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Nao foi possivel carregar o JSON principal.");
  }

  state.db = await response.json();
  hydrateState();
  await playBootSequence();
  bindEvents();
}

function bindEvents() {
  elements.chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (state.isReplying) {
      return;
    }

    const rawInput = elements.chatInput.value.trim();
    if (!rawInput) {
      return;
    }

    elements.chatInput.value = "";
    appendUserMessage(rawInput);
    updateMemory({
      turns: state.memory.turns + 1,
      lastInput: rawInput,
    });

    await handleReply(rawInput);
    elements.chatInput.focus();
  });
}

function hydrateState() {
  const initialMemory = state.db.initialMemory ?? {};
  state.memory = {
    turns: 0,
    lastNode: null,
    lastInput: "",
    flags: [],
    history: [],
    ...initialMemory,
    ...state.memory,
  };
  updateMemory(state.memory);
}

async function playBootSequence() {
  if (state.memory.history.length) {
    restoreHistory();
    return;
  }

  const bootMessages = state.db.bootSequence ?? [];
  for (const bootMessage of bootMessages) {
    await appendAssistantSequence(bootMessage);
  }
}

async function handleReply(input) {
  state.isReplying = true;
  toggleInput(false);

  const normalizedInput = normalize(input);
  const match = findBestReply(normalizedInput);

  if (match?.setFlags?.length) {
    const nextFlags = new Set(state.memory.flags);
    match.setFlags.forEach((flag) => nextFlags.add(flag));
    updateMemory({ flags: [...nextFlags] });
  }

  if (match?.clearFlags?.length) {
    const nextFlags = new Set(state.memory.flags);
    match.clearFlags.forEach((flag) => nextFlags.delete(flag));
    updateMemory({ flags: [...nextFlags] });
  }

  if (match?.id) {
    updateMemory({ lastNode: match.id });
  }

  const replyPayload = match ?? getFallbackReply();
  await appendAssistantSequence(replyPayload);

  state.isReplying = false;
  toggleInput(true);
}

function findBestReply(normalizedInput) {
  const replies = [...(state.db.replies ?? [])];

  return replies
    .map((reply) => ({
      reply,
      score: getReplyScore(reply, normalizedInput),
    }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score)[0]
    ?.reply;
}

function getReplyScore(reply, normalizedInput) {
  const match = reply.match ?? {};
  const flags = new Set(state.memory.flags);

  if ((match.requiresFlags ?? []).some((flag) => !flags.has(flag))) {
    return Number.NEGATIVE_INFINITY;
  }

  if ((match.excludesFlags ?? []).some((flag) => flags.has(flag))) {
    return Number.NEGATIVE_INFINITY;
  }

  if (match.maxTurns && state.memory.turns > match.maxTurns) {
    return Number.NEGATIVE_INFINITY;
  }

  if (match.previousNode && state.memory.lastNode !== match.previousNode) {
    return Number.NEGATIVE_INFINITY;
  }

  if ((match.exact ?? []).some((term) => normalize(term) === normalizedInput)) {
    return (reply.priority ?? 0) * 100 + 40;
  }

  if ((match.startsWith ?? []).some((term) => normalizedInput.startsWith(normalize(term)))) {
    return (reply.priority ?? 0) * 100 + 30;
  }

  if ((match.contains ?? []).some((term) => normalizedInput.includes(normalize(term)))) {
    return (reply.priority ?? 0) * 100 + 20;
  }

  if ((match.regex ?? []).some((pattern) => new RegExp(pattern, "i").test(normalizedInput))) {
    return (reply.priority ?? 0) * 100 + 10;
  }

  return Number.NEGATIVE_INFINITY;
}

function getFallbackReply() {
  const fallbacks = state.db.fallbackReplies ?? [];
  if (!fallbacks.length) {
    return {
      id: "fallback-default",
      label: "VOZ",
      script: [
        { type: "text", value: "Nao encontrei esse padrao." },
        { type: "pause", duration: 240 },
        { type: "text", value: "\nTente outra frase." },
      ],
    };
  }

  const index = Math.max(state.memory.turns - 1, 0) % fallbacks.length;
  return fallbacks[index];
}

function appendUserMessage(text) {
  appendMessage({
    author: "user",
    label: state.db.userLabel ?? "USUARIO",
    text,
    liveText: text,
  });
  pushHistory({
    author: "user",
    label: state.db.userLabel ?? "USUARIO",
    text,
  });
}

async function appendAssistantSequence(reply) {
  await sleep(reply.delayBefore ?? MESSAGE_DELAY);

  const textElement = appendMessage({
    author: "assistant",
    label: reply.label ?? state.db.assistantLabel ?? "VOZ",
    text: "",
    liveText: "",
    isCurrent: true,
  });

  const script = buildScript(reply);
  let visibleText = "";

  for (const step of script) {
    if (step.type === "pause") {
      await sleep(step.duration ?? 240);
      continue;
    }

    if (step.type === "delete") {
      const count = Math.min(step.count ?? 0, visibleText.length);
      for (let index = 0; index < count; index += 1) {
        visibleText = visibleText.slice(0, -1);
        renderMessageText(textElement, visibleText);
        await sleep(randomBetween(...DELETE_SPEED_RANGE));
      }
      continue;
    }

    if (step.type === "linebreak") {
      visibleText += "\n";
      renderMessageText(textElement, visibleText);
      await sleep(step.duration ?? 120);
      continue;
    }

    if (step.type === "text") {
      const chars = [...(step.value ?? "")];
      for (const char of chars) {
        visibleText += char;
        renderMessageText(textElement, visibleText);
        await sleep(step.speed ?? randomBetween(...TYPE_SPEED_RANGE));
      }
    }
  }

  textElement.closest(".message")?.classList.remove("current");
  pushHistory({
    author: "assistant",
    label: reply.label ?? state.db.assistantLabel ?? "VOZ",
    text: visibleText,
  });
}

function buildScript(reply) {
  if (reply.script?.length) {
    return reply.script;
  }

  if (reply.text) {
    return [{ type: "text", value: reply.text }];
  }

  return [{ type: "text", value: "..." }];
}

function appendMessage({ author, label, text, liveText, isCurrent = false }) {
  const fragment = elements.template.content.cloneNode(true);
  const message = fragment.querySelector(".message");
  const messageLabel = fragment.querySelector(".message-label");
  const messageText = fragment.querySelector(".message-text");

  message.classList.add(author);
  if (isCurrent) {
    message.classList.add("current");
  }

  messageLabel.textContent = label;
  messageText.textContent = text;
  messageText.dataset.text = liveText;

  elements.chatLog.append(message);
  scrollChatToBottom();

  return messageText;
}

function restoreHistory() {
  for (const entry of state.memory.history) {
    appendMessage({
      author: entry.author,
      label: entry.label,
      text: entry.text,
      liveText: entry.text,
    });
  }
}

function renderMessageText(element, value) {
  element.textContent = value;
  element.dataset.text = value;
  scrollChatToBottom();
}

function scrollChatToBottom() {
  elements.chatLog.scrollTo({
    top: elements.chatLog.scrollHeight,
    behavior: "smooth",
  });
}

function toggleInput(isEnabled) {
  elements.chatInput.disabled = !isEnabled;
  elements.chatForm.querySelector("button").disabled = !isEnabled;
}

function normalize(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadMemory() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function updateMemory(patch) {
  state.memory = {
    ...state.memory,
    ...patch,
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.memory));
}

function pushHistory(entry) {
  const history = [...state.memory.history, entry].slice(-80);
  updateMemory({ history });
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(duration) {
  return new Promise((resolve) => window.setTimeout(resolve, duration));
}

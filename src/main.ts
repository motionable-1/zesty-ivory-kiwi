import "@hyperframes/player";
import "./styles/global.css";

const PLAYER_READY_TYPE = "motionabl:player-ready";
const PLAYER_STATE_TYPE = "motionabl:player-state";
const PLAYER_COMMAND_TYPE = "motionabl:player-command";
const DEFAULT_FPS = 30;

type PlayerCommandMessage = {
  type: typeof PLAYER_COMMAND_TYPE;
  command:
    | "play"
    | "pause"
    | "toggle-play"
    | "seek"
    | "mute"
    | "unmute"
    | "toggle-mute"
    | "request-fullscreen"
    | "request-state";
  frame?: number;
};

type HyperframesPlayerElement = HTMLElement & {
  play: () => void | Promise<void>;
  pause: () => void;
  seek?: (time: number) => void;
  currentTime: number;
  duration?: number;
  paused?: boolean;
  muted?: boolean;
  volume?: number;
  ready?: boolean;
  iframeElement?: HTMLIFrameElement | null;
  _parentMedia?: Array<{
    el: HTMLMediaElement;
    start: number;
    duration: number;
  }>;
  _promoteToParentProxy?: () => void;
};

const root = document.getElementById("root");
let parentMediaSyncRaf: number | null = null;
let playerStateSyncRaf: number | null = null;
let playbackClock:
  | {
      startTime: number;
      startedAt: number;
    }
  | null = null;

if (!root) {
  throw new Error("Missing #root element");
}

const getFrameFromHash = (): number | null => {
  const hash = window.location.hash;
  if (!hash) return null;

  const params = new URLSearchParams(hash.slice(1));
  const frameParam = params.get("frame");
  if (!frameParam) return null;

  const frame = Number.parseInt(frameParam, 10);
  return Number.isFinite(frame) && frame >= 0 ? frame : null;
};

const readCompositionMetadata = (player: HyperframesPlayerElement) => {
  const doc = player.iframeElement?.contentDocument;
  const composition = doc?.querySelector<HTMLElement>("[data-composition-id]");
  const width = Number(composition?.dataset.width ?? 1920);
  const height = Number(composition?.dataset.height ?? 1080);
  const fps = Number(composition?.dataset.motionablFps ?? DEFAULT_FPS);
  const compositionId = composition?.dataset.compositionId ?? "Main";

  return {
    compositionId,
    width: Number.isFinite(width) ? width : 1920,
    height: Number.isFinite(height) ? height : 1080,
    fps: Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_FPS,
  };
};

const getRawPlayerTime = (player: HyperframesPlayerElement) => {
  return typeof player.currentTime === "number" &&
    Number.isFinite(player.currentTime)
    ? player.currentTime
    : 0;
};

const clampTime = (time: number, duration?: number) => {
  const clampedTime = Math.max(0, time);
  return typeof duration === "number" && Number.isFinite(duration)
    ? Math.min(clampedTime, duration)
    : clampedTime;
};

const resetPlaybackClock = (
  player: HyperframesPlayerElement,
  time = getRawPlayerTime(player),
) => {
  playbackClock = {
    startTime: clampTime(time, player.duration),
    startedAt: performance.now(),
  };
};

const clearPlaybackClock = () => {
  playbackClock = null;
};

const getDisplayPlayerTime = (player: HyperframesPlayerElement) => {
  if (player.paused === false && playbackClock) {
    const elapsedSeconds = (performance.now() - playbackClock.startedAt) / 1000;
    return clampTime(playbackClock.startTime + elapsedSeconds, player.duration);
  }

  return clampTime(getRawPlayerTime(player), player.duration);
};

const resyncPlaybackClockIfNeeded = (player: HyperframesPlayerElement) => {
  if (player.paused !== false || !playbackClock) return;

  const rawTime = getRawPlayerTime(player);
  const displayTime = getDisplayPlayerTime(player);

  if (Math.abs(rawTime - displayTime) > 0.5) {
    resetPlaybackClock(player, rawTime);
  }
};

const createPlayerState = (player: HyperframesPlayerElement) => {
  const metadata = readCompositionMetadata(player);
  const durationSeconds =
    typeof player.duration === "number" && Number.isFinite(player.duration)
      ? player.duration
      : 0;
  const durationInFrames = Math.max(
    1,
    Math.ceil(durationSeconds * metadata.fps),
  );
  const currentFrame = Math.min(
    Math.max(getDisplayPlayerTime(player) * metadata.fps, 0),
    durationInFrames - 1,
  );

  return {
    compositionId: metadata.compositionId,
    durationInFrames,
    fps: metadata.fps,
    width: metadata.width,
    height: metadata.height,
    currentFrame,
    isPlaying: player.paused === false,
    isMuted: player.muted !== false,
  };
};

const postPlayerState = (
  player: HyperframesPlayerElement,
  type: typeof PLAYER_READY_TYPE | typeof PLAYER_STATE_TYPE,
) => {
  window.parent?.postMessage({ type, state: createPlayerState(player) }, "*");
};

const stopPlayerStateSync = () => {
  if (playerStateSyncRaf !== null) {
    cancelAnimationFrame(playerStateSyncRaf);
    playerStateSyncRaf = null;
  }
};

const startPlayerStateSync = () => {
  if (playerStateSyncRaf !== null) return;

  const tick = () => {
    if (!player) {
      playerStateSyncRaf = null;
      return;
    }

    postPlayerState(player, PLAYER_STATE_TYPE);

    if (player.paused === false) {
      playerStateSyncRaf = requestAnimationFrame(tick);
    } else {
      playerStateSyncRaf = null;
    }
  };

  playerStateSyncRaf = requestAnimationFrame(tick);
};

const initialFrame = getFrameFromHash();
const captureMode = new URLSearchParams(window.location.search).has("capture");

root.innerHTML = `
  <main
    class="app-shell"
    data-motionabl-composition-width="1920"
    data-motionabl-composition-height="1080"
  >
    <div class="app-backdrop"></div>
    <section class="app-stage">
      <div class="app-player-shell" data-motionabl-frame="true">
        <div class="app-player-gloss"></div>
        <hyperframes-player
          src="/composition/index.html"
          width="1920"
          height="1080"
          muted
        ></hyperframes-player>
      </div>
    </section>
  </main>
`;

const player =
  root.querySelector<HyperframesPlayerElement>("hyperframes-player");

if (!player) {
  throw new Error("Missing Hyperframes player");
}

const getTimedMediaVolume = (src: string, start: number) => {
  const doc = player.iframeElement?.contentDocument;
  if (!doc) return 1;

  const timedMedia = Array.from(
    doc.querySelectorAll<HTMLMediaElement>(
      "audio[data-start], video[data-start]",
    ),
  );
  for (const media of timedMedia) {
    const rawSrc = media.getAttribute("src");
    if (!rawSrc) continue;

    const mediaSrc = new URL(rawSrc, doc.baseURI).href;
    const mediaStart = Number.parseFloat(
      media.getAttribute("data-start") ?? "0",
    );
    if (mediaSrc !== src || Math.abs(mediaStart - start) >= 0.001) continue;

    const clipVolume = Number.parseFloat(
      media.getAttribute("data-volume") ?? "1",
    );
    return Number.isFinite(clipVolume) ? clipVolume : 1;
  }

  return 1;
};

const syncParentMediaPlayback = () => {
  const parentMedia = player._parentMedia ?? [];
  const playerVolume =
    typeof player.volume === "number" && Number.isFinite(player.volume)
      ? player.volume
      : 1;
  const currentTime = player.currentTime || 0;
  const isPlaying = player.paused === false;
  const muted = player.muted !== false;

  for (const entry of parentMedia) {
    const clipEnd = entry.start + entry.duration;
    const isInRange = currentTime >= entry.start && currentTime < clipEnd;
    const relativeTime = Math.max(
      0,
      Math.min(entry.duration, currentTime - entry.start),
    );

    entry.el.muted = muted;
    entry.el.volume = Math.max(
      0,
      Math.min(1, getTimedMediaVolume(entry.el.src, entry.start) * playerVolume),
    );

    if (!isPlaying || !isInRange) {
      if (!entry.el.paused) entry.el.pause();
      if (currentTime < entry.start && entry.el.currentTime !== 0) {
        entry.el.currentTime = 0;
      }
      continue;
    }

    if (Math.abs(entry.el.currentTime - relativeTime) > 0.08) {
      entry.el.currentTime = relativeTime;
    }
    if (entry.el.paused) {
      void entry.el.play().catch(() => undefined);
    }
  }
};

const stopParentMediaSync = () => {
  if (parentMediaSyncRaf !== null) {
    cancelAnimationFrame(parentMediaSyncRaf);
    parentMediaSyncRaf = null;
  }
  syncParentMediaPlayback();
};

const startParentMediaSync = () => {
  if (parentMediaSyncRaf !== null) return;

  const tick = () => {
    syncParentMediaPlayback();
    if (player.paused === false) {
      parentMediaSyncRaf = requestAnimationFrame(tick);
    } else {
      parentMediaSyncRaf = null;
    }
  };

  tick();
};

const originalPlayerPlay = player.play.bind(player);
player.play = () => {
  // Direct-timeline compositions do not emit the runtime autoplay-blocked signal
  // that normally transfers timed audio to the parent frame before playback.
  player._promoteToParentProxy?.();
  const result = originalPlayerPlay();
  syncParentMediaPlayback();
  startParentMediaSync();
  return result;
};

const calculatePlayerSize = () => {
  const aspectRatio = 1920 / 1080;
  const maxWidth = window.innerWidth * 0.96;
  const maxHeight = Math.max(220, window.innerHeight * 0.96);

  let playerWidth = maxWidth;
  let playerHeight = playerWidth / aspectRatio;

  if (playerHeight > maxHeight) {
    playerHeight = maxHeight;
    playerWidth = playerHeight * aspectRatio;
  }

  player.style.width = `${playerWidth}px`;
  player.style.height = `${playerHeight}px`;
  player.style.maxWidth = "100%";
  player.style.maxHeight = "100%";
};

const seekToFrame = (frame: number) => {
  const { fps } = readCompositionMetadata(player);
  const time = Math.max(0, frame / fps);
  if (typeof player.seek === "function") {
    player.seek(time);
  } else {
    player.currentTime = time;
  }
  resetPlaybackClock(player, time);
};

const bindPlayerEvents = () => {
  const postState = () => postPlayerState(player, PLAYER_STATE_TYPE);

  player.addEventListener("ready", () => {
    if (initialFrame !== null) {
      seekToFrame(initialFrame);
      player.pause();
    } else if (!captureMode) {
      void player.play();
    }

    postPlayerState(player, PLAYER_READY_TYPE);
    postState();
  });

  player.addEventListener("timeupdate", () => {
    syncParentMediaPlayback();
    resyncPlaybackClockIfNeeded(player);
    if (player.paused !== false) {
      postState();
    }
  });
  player.addEventListener("play", () => {
    resetPlaybackClock(player);
    startParentMediaSync();
    startPlayerStateSync();
    postState();
  });
  player.addEventListener("pause", () => {
    stopParentMediaSync();
    stopPlayerStateSync();
    clearPlaybackClock();
    postState();
  });
  player.addEventListener("ended", () => {
    stopParentMediaSync();
    stopPlayerStateSync();
    clearPlaybackClock();
    postState();
  });
  player.addEventListener("volumechange", () => {
    syncParentMediaPlayback();
    postState();
  });
};

window.addEventListener("message", (event: MessageEvent) => {
  const message = event.data as Partial<PlayerCommandMessage>;
  if (!message || message.type !== PLAYER_COMMAND_TYPE) return;

  switch (message.command) {
    case "play":
      void player.play();
      break;
    case "pause":
      player.pause();
      break;
    case "toggle-play":
      if (player.paused === false) player.pause();
      else void player.play();
      break;
    case "seek":
      seekToFrame(message.frame ?? 0);
      syncParentMediaPlayback();
      break;
    case "mute":
      player.muted = true;
      break;
    case "unmute":
      player.muted = false;
      break;
    case "toggle-mute":
      player.muted = player.muted === false;
      break;
    case "request-fullscreen":
      void document.documentElement.requestFullscreen?.();
      break;
    case "request-state":
      break;
  }

  postPlayerState(player, PLAYER_STATE_TYPE);
});

window.addEventListener("resize", calculatePlayerSize);
calculatePlayerSize();
bindPlayerEvents();

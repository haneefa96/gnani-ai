import type { RouteObject } from "react-router-dom";
import { VoiceTestPage } from "./VoiceTestPage";

/**
 * Voice routes mounted by Developer B's router (react-router-dom v6/v7).
 * Contractor routes are intentionally excluded here per decision D4.
 */
export const voiceRoutes: RouteObject[] = [
  {
    path: "/voice-test",
    element: <VoiceTestPage />,
  },
];

export { VoiceButton } from "./VoiceButton";
export { TtsPlayer } from "./TtsPlayer";
export { useSttSocket } from "./useSttSocket";
export { VoiceTestPage } from "./VoiceTestPage";
export * from "./types";


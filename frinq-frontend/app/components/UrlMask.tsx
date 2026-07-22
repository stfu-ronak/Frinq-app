"use client";

import { useEffect } from "react";

/**
 * Intercepts window.history.pushState and replaceState so every navigation
 * within the quiz always shows "/" in the address bar.
 * Next.js stores route info in the history state object, not the URL string,
 * so internal routing (and the back button) continues to work correctly.
 * Methods are restored when the quiz layout unmounts.
 */
export default function UrlMask() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const origPush = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);

    history.pushState = function (state, title, _url) {
      return origPush(state, title, "/");
    };
    history.replaceState = function (state, title, _url) {
      return origReplace(state, title, "/");
    };

    // Mask current URL immediately
    origReplace(history.state, "", "/");

    return () => {
      history.pushState = origPush;
      history.replaceState = origReplace;
    };
  }, []);

  return null;
}

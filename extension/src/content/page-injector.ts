// Runs in the page's MAIN world at document_start (see manifest).
// Hooks fetch + XHR to capture the playback/v3/.../play JSON response
// (the player has the auth token; we don't, so we can't re-fetch).
// Forwards captured responses to the content script via window.postMessage.

(() => {
  const ANIME_DUB_MARKER = "__anime_dub_playback__";

  const isPlaybackUrl = (u: string | undefined | null): boolean =>
    !!u && u.includes("/playback/v3/") && u.includes("/play");

  const post = (url: string, data: unknown): void => {
    window.postMessage({ [ANIME_DUB_MARKER]: true, url, data }, "*");
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : ((input as Request | undefined)?.url ?? "");
    const result = originalFetch(input, init);
    if (isPlaybackUrl(url)) {
      result
        .then((resp) => {
          if (resp.ok) {
            resp
              .clone()
              .json()
              .then((data: unknown) => post(url, data))
              .catch(() => {});
          }
        })
        .catch(() => {});
    }
    return result;
  };

  type XHRWithUrl = XMLHttpRequest & { __animeDubUrl?: string };
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (
    this: XHRWithUrl,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ): void {
    this.__animeDubUrl = String(url);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (origOpen as any).call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (
    this: XHRWithUrl,
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    const url = this.__animeDubUrl ?? "";
    if (isPlaybackUrl(url)) {
      this.addEventListener("load", () => {
        if (this.status >= 200 && this.status < 300) {
          try {
            post(url, JSON.parse(this.responseText));
          } catch {
            // ignore
          }
        }
      });
    }
    return origSend.call(this, body);
  };
})();

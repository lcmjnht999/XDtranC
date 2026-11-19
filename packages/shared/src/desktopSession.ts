/** Desktop IPC returns presence only; no API can read the submitted secret back. */
export interface SessionKeyState {
  configured: boolean;
}

export interface SessionKeyInput {
  endpoint: string;
  apiKey: string;
}

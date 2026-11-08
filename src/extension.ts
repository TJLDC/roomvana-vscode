// Roomvana for VS Code.
//
// One job: move an image out of the workspace and into the Roomvana studio.
// The studio's hand-off endpoint is public and stateless — POST the bytes as a
// single-use token, then open `https://roomvana.ai/design?handoff=<token>` in
// the system browser, where the page reads that token once and shows the photo
// ready to redesign. No account is needed for the hand-off itself, no credit is
// spent, and nothing about the workspace is reported anywhere.

import * as vscode from "vscode";

const STUDIO_URL = "https://roomvana.ai/design";
const HANDOFF_ENDPOINT = "https://api.roomvana.co/handoff";

/** Same cap the endpoint enforces (20 MB); checked locally so nothing is sent. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
};

const SUPPORTED_EXTENSIONS = Object.keys(MIME_BY_EXTENSION);

/** An error whose message is written for the user and safe to show as-is. */
class UserFacingError extends Error {}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("roomvana.openStudio", openStudio),
    vscode.commands.registerCommand("roomvana.redesignImage", (resource: unknown) =>
      redesign(firstUri(resource))
    )
  );
}

export function deactivate(): void {
  // Nothing to clean up: no watchers, no background work, no state.
}

async function openStudio(): Promise<void> {
  const opened = await vscode.env.openExternal(vscode.Uri.parse(STUDIO_URL));
  if (!opened) {
    void vscode.window.showErrorMessage(
      `Roomvana: couldn't open your browser. Open ${STUDIO_URL} manually.`
    );
  }
}

/**
 * The single flow behind both the command palette and the explorer menu entry.
 * `resource` is set by the context menu; from the palette it is undefined and
 * the user picks a file instead.
 */
async function redesign(resource: vscode.Uri | undefined): Promise<void> {
  const file = resource ?? (await pickFile());
  if (!file) return; // The user closed the dialog.

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Roomvana: preparing your design",
      },
      async (progress) => {
        progress.report({ message: "Sending the image…" });
        const token = await requestHandoffToken(file);

        progress.report({ message: "Opening the studio in your browser…" });
        const opened = await vscode.env.openExternal(
          vscode.Uri.parse(`${STUDIO_URL}?handoff=${encodeURIComponent(token)}`)
        );
        if (!opened) {
          throw new UserFacingError(
            `Couldn't open your browser. Open ${STUDIO_URL} manually.`
          );
        }
      }
    );
  } catch (error) {
    void vscode.window.showErrorMessage(`Roomvana: ${userMessage(error)}`);
  }
}

async function pickFile(): Promise<vscode.Uri | undefined> {
  const picked = await vscode.window.showOpenDialog({
    title: "Choose a room photo or floor plan",
    openLabel: "Redesign with Roomvana",
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: { "Images and PDFs": SUPPORTED_EXTENSIONS },
  });
  return picked?.[0];
}

/** POSTs the file to the hand-off endpoint and returns the single-use token. */
async function requestHandoffToken(file: vscode.Uri): Promise<string> {
  const extension = extensionOf(file);
  const mime = MIME_BY_EXTENSION[extension];
  if (!mime) {
    throw new UserFacingError(
      "That file type isn't supported. Choose a PNG, JPG, WebP or GIF image, or a PDF."
    );
  }

  let stat: vscode.FileStat;
  try {
    stat = await vscode.workspace.fs.stat(file);
  } catch {
    throw new UserFacingError("Couldn't read that file from your workspace.");
  }
  if (stat.type === vscode.FileType.Directory) {
    throw new UserFacingError("That's a folder. Choose an image or a PDF file.");
  }
  if (stat.size > MAX_UPLOAD_BYTES) {
    throw new UserFacingError(
      "That file is larger than 20 MB, the hand-off limit. Resize it or export a smaller PDF and try again."
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = await vscode.workspace.fs.readFile(file);
  } catch {
    throw new UserFacingError("Couldn't read that file from your workspace.");
  }
  if (bytes.byteLength === 0) {
    throw new UserFacingError("That file is empty. Choose another image or PDF.");
  }

  const form = new FormData();
  // A neutral upload name: the endpoint only looks at the bytes, and the file's
  // own name and path have no reason to leave the workspace.
  form.append("file", new Blob([bytes], { type: mime }), `roomvana-upload.${extension}`);

  let response: Response;
  try {
    response = await fetch(HANDOFF_ENDPOINT, { method: "POST", body: form });
  } catch {
    throw new UserFacingError(
      "Couldn't reach Roomvana. Check your internet connection and try again."
    );
  }

  if (response.status === 429) {
    throw new UserFacingError(
      "Too many requests — Roomvana allows 30 hand-offs per hour. Please try again later."
    );
  }
  if (!response.ok) {
    throw new UserFacingError(failureMessage(response.status));
  }

  let token: unknown;
  try {
    const payload: unknown = await response.json();
    token = isRecord(payload) ? payload.token : undefined;
  } catch {
    throw new UserFacingError("Roomvana returned an unexpected response. Please try again.");
  }
  if (typeof token !== "string" || token.length === 0) {
    throw new UserFacingError("Roomvana returned an unexpected response. Please try again.");
  }
  return token;
}

function failureMessage(status: number): string {
  switch (status) {
    case 400:
      return "Roomvana couldn't read that file. Try another image or PDF.";
    case 413:
      return "That file is larger than the 20 MB hand-off limit.";
    default:
      return `Roomvana responded with HTTP ${status}. Please try again in a moment.`;
  }
}

/** Never surfaces a stack trace or an internal error string. */
function userMessage(error: unknown): string {
  return error instanceof UserFacingError
    ? error.message
    : "Something went wrong while preparing your image. Please try again.";
}

/** The explorer passes one Uri, or an array when several are selected. */
function firstUri(resource: unknown): vscode.Uri | undefined {
  if (resource instanceof vscode.Uri) return resource;
  if (Array.isArray(resource)) {
    const [first] = resource as unknown[];
    if (first instanceof vscode.Uri) return first;
  }
  return undefined;
}

function extensionOf(uri: vscode.Uri): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(uri.path);
  return match ? match[1].toLowerCase() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

# Roomvana — AI Room Design for VS Code

Redesign your house, yard, or any room from a photo — without leaving your
workspace. Pick an image (or a floor plan PDF) in VS Code, and Roomvana opens in
your browser with that image loaded and ready to redesign in a new style.

Learn more at **[roomvana.ai](https://roomvana.ai)**.

## Features

- **`Roomvana: Redesign Image with Roomvana`** — choose a PNG, JPG, WebP, GIF,
  or PDF from anywhere your workspace can read, and Roomvana's studio opens in
  your default browser with the image loaded.
- **`Roomvana: Open Roomvana Studio`** — just open
  [roomvana.ai/design](https://roomvana.ai/design) in your browser.
- **Explorer right-click** — right-click any `.png`, `.jpg`, `.jpeg`, `.webp`,
  `.gif`, or `.pdf` in the Explorer and choose **Redesign with Roomvana**. The
  file goes straight to the studio; there is no extra dialog.

Both commands are also available from the Command Palette (`Cmd/Ctrl+Shift+P`,
then type `Roomvana`).

## Requirements

- VS Code 1.85 or newer.
- An internet connection. The design itself runs on roomvana.ai in your browser;
  you sign in there, and nothing is generated inside VS Code.
- Files up to 20 MB. The hand-off endpoint accepts images and PDFs only.

## How it works

1. The extension reads the file you picked from the workspace.
2. It uploads those bytes to Roomvana's public hand-off endpoint over HTTPS.
3. The endpoint returns a single-use token, and the extension opens
   `https://roomvana.ai/design?handoff=<token>` in your browser.
4. The studio reads the token once, shows your image, and you continue there.

If the endpoint is busy you'll see a "too many requests" notice — the limit is
30 hand-offs per hour. If the network is down or the file can't be read, you get
a short message instead of a stack trace.

## Privacy

- The only thing sent anywhere is the image or PDF you explicitly pick, and it
  goes to Roomvana's hand-off endpoint (`api.roomvana.co/handoff`).
- The upload token expires after **30 minutes** and can be read **once**.
  Roomvana does not keep the uploaded file; it exists only in memory until the
  studio picks it up.
- No telemetry, no analytics, no usage reporting. The extension does not collect
  file paths, file names, or any other workspace data, and it sends a neutral
  upload name rather than your file's real name.
- Nothing leaves your machine until you run one of the commands.

## Development

```bash
npm install
npm run compile        # TypeScript -> out/
npx @vscode/vsce package
```

Press `F5` in VS Code with this folder open to launch an Extension Development
Host.

## License

MIT — see [LICENSE](LICENSE).

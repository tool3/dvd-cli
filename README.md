# DVD

<p align="center">
  <img alt="Demo" src="examples/svgs/figlet.svg" width="600">
</p>

<p align="center">
  <em>Create animated SVG terminal recordings from scripts</em>
</p>

---

DVD is a CLI tool for generating animated SVG terminal recordings. Write a simple script, run `dvd`, and get a beautiful SVG animation.

```
Output demo.svg

Set Theme dracula
Set Template macos

Type "echo 'Hello, DVD!'"
Enter
Sleep 2s
```

No ffmpeg. No browser. No dependencies. Just SVG.

## Installation

```bash
npm install -g dvd-cli
```

## Quick Start

```bash
# Create a new script
dvd new demo

# Render it
dvd demo.cd
```

## Tutorial

Let's create a simple terminal recording.

**1. Create a script**

```bash
dvd new hello
```

This creates `hello.cd`:

```
Output hello.svg

Set Theme dracula
Set Template macos
Set Title "Hello World"

Type "echo 'Hello, World!'"
Enter
Sleep 2s
```

**2. Render it**

```bash
dvd hello.cd
```

**3. View the result**

Open `hello.svg` in your browser or embed it in your README:

```markdown
![Demo](hello.svg)
```

## Commands

### Type

Type text into the terminal with realistic timing.

```
Type "echo 'Hello World'"
```

<img src="examples/svgs/slow-typing-test.svg" width="600">

### Enter

Press enter to execute the command.

```
Type "neofetch"
Enter
```

<img src="examples/svgs/neofetch-autoheight.svg" width="600">

### Sleep

Pause the recording.

```
Sleep 500ms
Sleep 2s
```

### Backspace

Delete characters.

```
Type "Hello Wrold"
Backspace 4
Type "orld!"
```

<img src="examples/svgs/backspace.svg" width="600">

### Arrow Keys

Navigate with arrow keys.

```
Left
Right
Up
Down
```

### Keyboard Shortcuts

Full keyboard navigation support.

```
Shift+Left       # Select character left
Shift+Right      # Select character right
Alt+Left         # Move word left
Alt+Right        # Move word right
Alt+Shift+Left   # Select word left
Alt+Shift+Right  # Select word right
Cmd+Left         # Move to line start
Cmd+Right        # Move to line end
Cmd+Backspace    # Delete word
```

<img src="examples/svgs/keyboard-navigation-demo.svg" width="600">

### Screenshot

Capture a static frame.

```
Screenshot frame.svg
```

## Settings

### Output

Set the output file path.

```
Output demo.svg
```

### Theme

Set the color theme.

```
Set Theme dracula
```

Available themes: `catppuccinMocha`, `dracula`, `githubDark`, `githubLight`, `gruvboxDark`, `gruvboxLight`, `monokai`, `nord`, `oneDark`, `solarizedDark`, `solarizedLight`, `tokyoNight`, `terminal`

<img src="examples/svgs/nord-theme.svg" width="600">

### Template

Set the window style.

```
Set Template macos
Set Template windows
Set Template minimal
```

| Template | Description |
|----------|-------------|
| `minimal` | Clean, no decorations (default) |
| `macos` | macOS-style with traffic light buttons |
| `windows` | Windows-style with title bar buttons |

<img src="examples/svgs/macos-style.svg" width="600">

### Dimensions

Set terminal size. Omit for auto-sizing.

```
Set Width 800
Set Height 600
```

Auto-sizing adjusts dimensions based on content:

```
# Auto width and height
Set FontSize 16
Type "Content determines size"
```

### Font

Set font family or embed a custom font.

```
# System font (viewer must have it installed)
Set FontFamily "Fira Code"

# Embedded font (always works)
Set EmbedFont path/to/font.woff2
```

<img src="examples/svgs/embed-font-test.svg" width="600">

### Title

Set the window title (shown with macos/windows templates).

```
Set Title "My Terminal"
```

### Cursor

Customize cursor appearance.

```
Set CursorStyle block    # block, bar, underline
Set CursorColor #ffffff
Set CursorBlink true
```

<img src="examples/svgs/cursor-style-test.svg" width="600">

### Typing Speed

Control typing speed in milliseconds per character.

```
Set TypingSpeed 50
```

### Prompt

Customize the shell prompt (supports ANSI).

```
Set PromptPrefix "❯ "
Set PromptPrefix "\x1b[95m❯\x1b[0m "
```

<img src="examples/svgs/custom-prompt.svg" width="600">

### Border

Style the window border.

```
Set BorderRadius 8
Set BorderWidth 2
Set BorderColor #ff0000
```

### Header & Footer

Customize header and footer sections.

```
Set HeaderHeight 40
Set HeaderBackground #333333
Set HeaderBorder true

Set FooterHeight 30
Set FooterBackground #333333
Set FooterBorder true
```

<img src="examples/svgs/header-footer-test.svg" width="600">

### Watermark

Add a watermark (supports ANSI).

```
Set Watermark "Made with DVD"
```

## CLI Options

```bash
dvd [file]                    # Render a script
dvd [file] -o output.svg      # Custom output path
dvd [file] --verbose          # Show progress
dvd [file] --no-loop          # Don't loop animation
dvd [file] --pause-at-end 2000  # Pause at end (ms)

dvd new [name]                # Create new script
dvd new [name] --template showcase

dvd themes                    # List themes
dvd validate [file]           # Validate script
```

## Examples

### ANSI Colors

<img src="examples/svgs/ansi-colors.svg" width="600">

### ASCII Art

<img src="examples/svgs/figlet.svg" width="600">

### Charts

<img src="examples/svgs/chartscii.svg" width="600">

### Animated Output

Commands with animated output (like `lolcat -fa`) are automatically captured frame-by-frame.

<img src="examples/svgs/lolcat-animation.svg" width="600">

### Git Log

<img src="examples/svgs/git-log.svg" width="600">

See the [examples/](examples/) directory for more.

## Why DVD?

| | DVD | VHS |
|---|---|---|
| **Output** | SVG | GIF/MP4 |
| **Dependencies** | None | ffmpeg, ttyd |
| **File size** | Small | Large |
| **Scalable** | Yes | No |
| **GitHub README** | Perfect | Works |
| **Editable** | Yes (it's XML) | No |

## Related

- [VHS](https://github.com/charmbracelet/vhs) - GIF/MP4 terminal recordings
- [shellfie](https://github.com/tool3/shellfie) - Static terminal screenshots

## License

MIT

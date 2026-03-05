# dvd - Cinema Display for Terminal Recordings

Create beautiful animated SVG terminal recordings from `.cd` scripts.

Inspired by [VHS](https://github.com/charmbracelet/vhs), dvd generates pure SVG animations without requiring ffmpeg, ttyd, or a browser. Perfect for documentation, demos, and showcasing CLI tools in GitHub READMEs.

## Features

- 🎬 **Pure SVG animations** - No video encoding, just CSS keyframes
- 🚀 **Zero external dependencies** - No ffmpeg, ttyd, or Chromium required
- 📝 **VHS-inspired syntax** - Familiar declarative scripting format
- 🎨 **13 built-in themes** - Dracula, Nord, Tokyo Night, and more
- ⌨️ **Keyboard navigation** - Full support for text selection, word movement, shortcuts
- 📸 **Screenshots** - Capture static frames during animation
- 🔧 **Customizable** - Fonts, dimensions, themes, templates

## Installation

```bash
npm install -g dvd-cli
```

## Quick Start

Create a new script:

```bash
dvd new demo
```

This creates `demo.cd`:

```
# Basic CD Script
Output demo.svg

Set Title "My Terminal Demo"
Set Theme dracula
Set Width 800
Set Height 600

Type "echo 'Hello, Cinema Display!'"
Enter
Sleep 1s
```

Render it to SVG:

```bash
dvd demo.cd
```

## Commands

### dvd [file]

Render a `.cd` script to animated SVG (default command).

```bash
dvd script.cd
dvd script.cd -o output.svg
dvd script.cd --verbose
dvd script.cd --no-loop
```

**Options:**
- `-o, --output <path>` - Output SVG file path
- `-v, --verbose` - Show detailed progress
- `-l, --loop` - Loop animation (default: true)
- `-p, --pause-at-end <ms>` - Pause duration at end (default: 1000)
- `-f, --fps <number>` - Frames per second

### dvd new [name]

Create a new `.cd` script from a template.

```bash
dvd new my-demo
dvd new showcase --template showcase
dvd new keyboard --template keyboard
```

**Templates:**
- `basic` - Simple demo (default)
- `showcase` - Feature showcase with screenshots
- `keyboard` - Keyboard navigation demo

### dvd themes

List all available themes.

```bash
dvd themes
```

### dvd validate <file>

Validate a `.cd` script.

```bash
dvd validate script.cd
```

## .cd Format

See [FORMAT.md](FORMAT.md) for complete specification.

### Basic Commands

```
# Output
Output demo.svg

# Basic settings
Set Width 800
Set Height 600
Set FontSize 16
Set Theme dracula
Set Title "My Demo"
Set TypingSpeed 50

# Input simulation
Type "echo 'Hello World'"
Enter
Backspace 5
Space
Tab

# Arrow keys
Left
Right
Up
Down

# Keyboard shortcuts
Shift+Left
Shift+Right
Alt+Left
Alt+Right
Cmd+Left
Cmd+Right
Cmd+Backspace

# Timing
Sleep 1s
Sleep 500ms

# Utilities
Screenshot frame.svg
```

## Set Commands Reference

All available `Set` commands for configuring your terminal recording:

### Dimensions & Layout

| Command | Description | Default |
|---------|-------------|---------|
| `Set Width <px>` | Terminal width in pixels. Omit for auto-width based on content. | auto |
| `Set Height <px>` | Terminal height in pixels. Omit for auto-height based on content. | auto |
| `Set FontSize <px>` | Font size in pixels | 14 |
| `Set Padding <px>` | Content padding in pixels | 16 |

### Font

| Command | Description | Default |
|---------|-------------|---------|
| `Set FontFamily <name>` | Font family name (system font or web font) | SF Mono, Monaco, etc. |
| `Set EmbedFont <path>` | Embed a font file (woff2, ttf, otf) into the SVG | none |

### Appearance

| Command | Description | Default |
|---------|-------------|---------|
| `Set Theme <name>` | Color theme (see Themes section) | dark |
| `Set Template <name>` | Window template: `macos`, `windows`, `minimal` | minimal |
| `Set Title <text>` | Window title (shown in title bar for macos/windows templates) | none |
| `Set Watermark <text>` | Watermark text (bottom-right, supports ANSI) | none |
| `Set PromptPrefix <text>` | Custom shell prompt prefix (supports ANSI) | `❯ ` |

### Border & Corners

| Command | Description | Default |
|---------|-------------|---------|
| `Set BorderRadius <px>` | Window corner radius | 8 (0 for minimal) |
| `Set BorderWidth <px>` | Window border width | 0 |
| `Set BorderColor <color>` | Window border color (hex) | theme foreground |

### Header Configuration

| Command | Description | Default |
|---------|-------------|---------|
| `Set HeaderBackground <color>` | Header background color (hex) | theme background |
| `Set HeaderHeight <px>` | Header height in pixels | 40 (0 for minimal) |
| `Set HeaderBorder <bool>` | Show border line below header | false |
| `Set HeaderBorderColor <color>` | Header border line color | theme foreground |
| `Set HeaderBorderWidth <px>` | Header border line width | 1 |

### Footer Configuration

| Command | Description | Default |
|---------|-------------|---------|
| `Set FooterBackground <color>` | Footer background color (hex) | none |
| `Set FooterHeight <px>` | Footer height in pixels | 0 |
| `Set FooterBorder <bool>` | Show border line above footer | false |
| `Set FooterBorderColor <color>` | Footer border line color | theme foreground |
| `Set FooterBorderWidth <px>` | Footer border line width | 1 |

### Cursor

| Command | Description | Default |
|---------|-------------|---------|
| `Set CursorStyle <style>` | Cursor shape: `block`, `bar`, `underline` | block |
| `Set CursorColor <color>` | Cursor color (hex) | theme cursor |
| `Set CursorBlink <bool>` | Enable cursor blinking | true |

### Behavior

| Command | Description | Default |
|---------|-------------|---------|
| `Set TypingSpeed <ms>` | Milliseconds per character when typing | 50 |
| `Set Scroll <bool>` | Enable scrolling when content exceeds height | auto |

### Auto-sizing

When you omit `Set Width` or `Set Height`, dvd automatically calculates dimensions:

```
# Auto width and height based on content
Set FontSize 16
Set Title "Auto-sized"
Type "Content determines size"
```

```
# Fixed height, auto width
Set Height 400
Type "Width auto-calculated"
```

```
# Fixed width, auto height (content can scroll)
Set Width 600
Type "Height auto-calculated"
```

## Examples

See the [examples/](examples/) directory for complete working examples:

- `ansi-colors.cd` - ANSI color demonstration
- `keyboard-navigation-demo.cd` - Text selection, word movement, shortcuts
- `themes.cd` - All available themes
- `custom-prompt.cd` - Custom shell prompts
- And more...

## Themes

Available themes:
- catppuccinMocha
- dracula
- githubDark
- githubLight
- gruvboxDark
- gruvboxLight
- monokai
- nord
- oneDark
- solarizedDark
- solarizedLight
- tokyoNight
- terminal

## Templates

Available templates:
- **minimal** - Clean, minimal design (default)
- **macos** - macOS-style terminal with traffic light buttons
- **windows** - Windows terminal style

## Related

- [shellfie](https://github.com/tool3/shellfie) - The core library for static terminal screenshots
- [shellfie-cli](https://github.com/tool3/shellfie-cli) - CLI for static SVG generation from terminal output
- [VHS](https://github.com/charmbracelet/vhs) - Similar tool that generates GIF/MP4 terminal recordings

## Why dvd?

**DVD** stands for "**D**ynamic **V**ideo **D**isplay", but we use `.cd` files (Cinema Display) because they're more fun and don't conflict with actual DVD video files.

Unlike VHS which uses a browser and ffmpeg to generate video files, dvd:
- Generates pure SVG with CSS animations (scalable, lightweight)
- Runs anywhere without external dependencies
- Produces smaller files (SVG vs GIF/MP4)
- Works perfectly in GitHub READMEs

## License

MIT

## Author

tool3

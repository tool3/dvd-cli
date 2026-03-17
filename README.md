<p align="center">
  <img src="assets/og-image.svg" alt="DVD - Terminal Recordings" width="800">
</p>

<p align="center">
  <strong>Create animated SVG terminal recordings from simple scripts and stdin</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/dvd-cli"><img src="https://img.shields.io/npm/v/dvd-cli.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/dvd-cli"><img src="https://img.shields.io/npm/dm/dvd-cli.svg" alt="npm downloads"></a>
  <a href="https://github.com/tool3/dvd/blob/master/LICENSE"><img src="https://img.shields.io/npm/l/dvd-cli.svg" alt="license"></a>
</p>

<p align="center">
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#commands">Commands</a> •
  <a href="#settings">Settings</a> •
  <a href="#loop-styles">Loop Styles</a> •
  <a href="#examples">Examples</a>
</p>

---

<p align="center">
  <img src="examples/svgs/everyday/demo.svg" width="600">
</p>

DVD generates animated SVG terminal recordings from declarative `.cd` scripts. Write what you want to happen, run `dvd`, and get a beautiful, infinitely scalable animation.

```
Output demo.svg

Set Theme tokyoNight
Set Template macos
Set Title "My Demo"

Type "echo 'Hello, World!'"
Enter
Sleep 2s
```

**No ffmpeg. No browser. No dependencies. Just SVG.**

## Installation

```bash
npm install -g dvd-cli
```

Or use directly with npx:

```bash
npx dvd-cli demo.cd
```

## Quick Start

### 1. Create a script

```bash
dvd new demo
```

This creates `demo.cd` with a starter template.

### 2. Edit your script

```
Output demo.svg

Set Template macos
Set Theme dracula
Set Title "My Terminal"

Type "echo 'Hello World!'"
Sleep 500ms
Enter
Sleep 1s
```

### 3. Render it

```bash
dvd demo.cd
```

### 4. Embed anywhere

```markdown
![Demo](demo.svg)
```

Your animated SVG works in GitHub READMEs, documentation sites, blogs - anywhere that supports images.

---

## Pipe Mode

Capture any command output directly:

```bash
# Capture a command's output
ls -la --color | dvd -o listing.svg

# Pipe animated output
lolcat -a -d 2 <<< "Hello World" | dvd -o rainbow.svg

# Capture neofetch
neofetch | dvd -o system-info.svg --title "System Info"
```

---

## Commands

### Type

Type text with realistic timing. Control speed with `@<ms>ms` suffix.

```
Type "echo 'Hello World'"
Type@100ms "Slow typing..."
Type@10ms "Speed typing!"
```

### Enter

Execute the current command.

```
Type "neofetch"
Enter
```

<img src="examples/svgs/everyday/neofetch.svg" width="600">

### Sleep

Pause the recording.

```
Sleep 500ms
Sleep 2s
```

### Backspace

Delete characters. Supports a count parameter.

```
Type "Hello Wrold"
Backspace 4
Type "orld!"
```

<img src="examples/svgs/navigation/backspace.svg" width="600">

### Arrow Keys

Navigate with arrow keys. Supports a count parameter.

```
Left          # Move cursor left
Right         # Move cursor right
Left 5        # Move cursor left 5 times
Right 10      # Move cursor right 10 times
```

### Keyboard Shortcuts

Full keyboard navigation with selection support.

```
Shift+Left           # Select character left
Shift+Right          # Select character right
Alt+Left             # Move word left
Alt+Right            # Move word right
Alt+Shift+Left       # Select word left
Alt+Shift+Right      # Select word right
Cmd+Left             # Move to line start
Cmd+Right            # Move to line end
Cmd+Backspace        # Delete word
```

<img src="examples/svgs/navigation/keyboard-navigation-demo.svg" width="600">

### Screenshot

Capture a static frame at any point.

```
Type "npm test"
Enter
Screenshot test-results.svg
```

---

## Settings

All settings use the `Set` command: `Set <Setting> <value>`

### Output

```
Output demo.svg
Output path/to/output.svg
```

### Theme

```
Set Theme dracula
```

**Available themes (37):**

<table>
<tr>
<td align="center"><strong>a11yDark</strong><br><img src="examples/svgs/themes/a11yDark.svg" width="280"></td>
<td align="center"><strong>base16Dark</strong><br><img src="examples/svgs/themes/base16Dark.svg" width="280"></td>
<td align="center"><strong>base16Light</strong><br><img src="examples/svgs/themes/base16Light.svg" width="280"></td>
</tr>
<tr>
<td align="center"><strong>blackboard</strong><br><img src="examples/svgs/themes/blackboard.svg" width="280"></td>
<td align="center"><strong>catppuccinMocha</strong><br><img src="examples/svgs/themes/catppuccinMocha.svg" width="280"></td>
<td align="center"><strong>cobalt</strong><br><img src="examples/svgs/themes/cobalt.svg" width="280"></td>
</tr>
<tr>
<td align="center"><strong>dark</strong><br><img src="examples/svgs/themes/dark.svg" width="280"></td>
<td align="center"><strong>dracula</strong><br><img src="examples/svgs/themes/dracula.svg" width="280"></td>
<td align="center"><strong>draculaPro</strong><br><img src="examples/svgs/themes/draculaPro.svg" width="280"></td>
</tr>
<tr>
<td align="center"><strong>duotoneDark</strong><br><img src="examples/svgs/themes/duotoneDark.svg" width="280"></td>
<td align="center"><strong>githubDark</strong><br><img src="examples/svgs/themes/githubDark.svg" width="280"></td>
<td align="center"><strong>githubLight</strong><br><img src="examples/svgs/themes/githubLight.svg" width="280"></td>
</tr>
<tr>
<td align="center"><strong>gruvboxDark</strong><br><img src="examples/svgs/themes/gruvboxDark.svg" width="280"></td>
<td align="center"><strong>gruvboxLight</strong><br><img src="examples/svgs/themes/gruvboxLight.svg" width="280"></td>
<td align="center"><strong>hopscotch</strong><br><img src="examples/svgs/themes/hopscotch.svg" width="280"></td>
</tr>
<tr>
<td align="center"><strong>lucario</strong><br><img src="examples/svgs/themes/lucario.svg" width="280"></td>
<td align="center"><strong>material</strong><br><img src="examples/svgs/themes/material.svg" width="280"></td>
<td align="center"><strong>monokai</strong><br><img src="examples/svgs/themes/monokai.svg" width="280"></td>
</tr>
<tr>
<td align="center"><strong>night3024</strong><br><img src="examples/svgs/themes/night3024.svg" width="280"></td>
<td align="center"><strong>nord</strong><br><img src="examples/svgs/themes/nord.svg" width="280"></td>
<td align="center"><strong>oceanicNext</strong><br><img src="examples/svgs/themes/oceanicNext.svg" width="280"></td>
</tr>
<tr>
<td align="center"><strong>oneDark</strong><br><img src="examples/svgs/themes/oneDark.svg" width="280"></td>
<td align="center"><strong>oneLight</strong><br><img src="examples/svgs/themes/oneLight.svg" width="280"></td>
<td align="center"><strong>pandaSyntax</strong><br><img src="examples/svgs/themes/pandaSyntax.svg" width="280"></td>
</tr>
<tr>
<td align="center"><strong>paraisoDark</strong><br><img src="examples/svgs/themes/paraisoDark.svg" width="280"></td>
<td align="center"><strong>seti</strong><br><img src="examples/svgs/themes/seti.svg" width="280"></td>
<td align="center"><strong>shadesOfPurple</strong><br><img src="examples/svgs/themes/shadesOfPurple.svg" width="280"></td>
</tr>
<tr>
<td align="center"><strong>solarizedDark</strong><br><img src="examples/svgs/themes/solarizedDark.svg" width="280"></td>
<td align="center"><strong>solarizedLight</strong><br><img src="examples/svgs/themes/solarizedLight.svg" width="280"></td>
<td align="center"><strong>synthwave84</strong><br><img src="examples/svgs/themes/synthwave84.svg" width="280"></td>
</tr>
<tr>
<td align="center"><strong>terminal</strong><br><img src="examples/svgs/themes/terminal.svg" width="280"></td>
<td align="center"><strong>tokyoNight</strong><br><img src="examples/svgs/themes/tokyoNight.svg" width="280"></td>
<td align="center"><strong>twilight</strong><br><img src="examples/svgs/themes/twilight.svg" width="280"></td>
</tr>
<tr>
<td align="center"><strong>verminal</strong><br><img src="examples/svgs/themes/verminal.svg" width="280"></td>
<td align="center"><strong>vscode</strong><br><img src="examples/svgs/themes/vscode.svg" width="280"></td>
<td align="center"><strong>yeti</strong><br><img src="examples/svgs/themes/yeti.svg" width="280"></td>
</tr>
<tr>
<td align="center"><strong>zenburn</strong><br><img src="examples/svgs/themes/zenburn.svg" width="280"></td>
<td></td>
<td></td>
</tr>
</table>

### Template

Window chrome style.

```
Set Template macos     # macOS traffic lights
Set Template windows   # Windows-style buttons
Set Template minimal   # No window decorations
```

<table>
<tr>
<td><strong>macOS</strong></td>
<td><strong>Windows</strong></td>
</tr>
<tr>
<td><img src="examples/svgs/templates/macos-style.svg" width="400"></td>
<td><img src="examples/svgs/templates/windows-style.svg" width="400"></td>
</tr>
</table>

### Title

```
Set Title "My Terminal"
```

### Dimensions

Omit for auto-sizing based on content.

```
Set Width 800
Set Height 600
```

### Font

```
# System font (viewer must have it installed)
Set FontFamily "Fira Code"
Set FontSize 14
Set LineHeight 1.4

# Embedded font (guaranteed to render correctly)
Set EmbedFont path/to/font.woff2
```

<img src="examples/svgs/fonts/embed-font-test.svg" width="600">

### Cursor

```
Set CursorStyle block      # block, bar, underline
Set CursorColor #ffffff
Set CursorBlink true
```

<img src="examples/svgs/cursor/cursor-style-test.svg" width="600">

### Typing Speed

Default milliseconds per character.

```
Set TypingSpeed 50
```

### Prompt

Supports ANSI escape codes for colors.

```
Set PromptPrefix "$ "
Set PromptPrefix "❯ "
Set PromptPrefix "\x1b[95m❯\x1b[0m "    # Colored prompt
```

<img src="examples/svgs/prompt/custom-prompt.svg" width="600">

### Border

```
Set BorderRadius 8
Set BorderWidth 2
Set BorderColor #ff0000
```

<img src="examples/svgs/templates/border-test.svg" width="600">

### Padding

```
Set Padding 16
```

### Header & Footer

```
Set HeaderHeight 40
Set HeaderBackground #333333
Set HeaderBorder true
Set HeaderBorderColor #444444
Set HeaderBorderWidth 1

Set FooterHeight 30
Set FooterBackground #333333
Set FooterBorder true
```

<img src="examples/svgs/templates/header-footer-test.svg" width="600">

### Watermark

```
Set Watermark "Made with DVD"
Set WatermarkStyle "opacity: 0.5; padding: 10"
```

For SVG markup watermarks (e.g., clickable links):

```
Set Watermark `<a href="https://github.com/tool3/dvd">
  <text text-anchor="end">DVD</text>
</a>`
```

### Shell

Set the shell for executing commands.

```
Set Shell /bin/zsh
Set Shell /bin/bash
```

---

## Loop Styles

Control how animations behave when they reach the end.

### Default Loop

Animation restarts from the beginning.

```
Set LoopStyle loop
```

### Reverse

Animation plays forward, then backward at the same speed.

```
Set LoopStyle reverse
```

<img src="examples/svgs/loop-style/loop-style-reverse-pause.svg" width="600">

### Rewind

Fast reverse playback - like rewinding a tape.

```
Set LoopStyle rewind
Set RewindSpeed 10       # Speed multiplier (default: 5)
```

<img src="examples/svgs/loop-style/loop-style-rewind.svg" width="600">

### Fade

Fade to black before restarting.

```
Set LoopStyle fade
Set FadeDuration 1500    # Fade duration in ms (default: 1500)
```

<img src="examples/svgs/loop-style/loop-style-fade.svg" width="600">

### Loop Pause

Add a pause between animation cycles.

```
Set LoopPause 2000       # Pause 2 seconds before restarting
```

---

## CLI Options

```bash
# Basic usage
dvd script.cd                          # Render to script.svg
dvd script.cd -o output.svg            # Custom output path
dvd script.cd --verbose                # Show detailed output

# Loop styles
dvd script.cd --loop-style reverse     # Reverse animation
dvd script.cd --loop-style rewind      # Fast rewind
dvd script.cd --loop-style fade        # Fade to black
dvd script.cd --rewind-speed 10        # Rewind speed multiplier
dvd script.cd --fade-duration 2000     # Fade duration (ms)
dvd script.cd --loop-pause 1500        # Pause between loops (ms)

# Animation control
dvd script.cd --no-loop                # Play once, don't loop
dvd script.cd --pause-at-end 2000      # Pause at end before looping

# Styling (override script settings)
dvd script.cd --theme dracula
dvd script.cd --template macos
dvd script.cd --title "My Demo"
dvd script.cd --font-size 16
dvd script.cd --cursor-style bar

# Dimensions
dvd script.cd --width 800 --height 600

# Pipe mode
command | dvd -o output.svg
ls -la | dvd -o listing.svg --theme nord

# Utilities
dvd new my-demo                        # Create new script
dvd new my-demo --template showcase    # Use template
dvd themes                             # List themes
dvd validate script.cd                 # Validate without rendering
```

### All CLI Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--output` | `-o` | Output file path | `<input>.svg` |
| `--verbose` | `-v` | Show detailed output | `false` |
| `--loop` | `-l` | Loop the animation | `true` |
| `--loop-style` | `-L` | Loop style: `loop`, `reverse`, `rewind`, `fade` | `loop` |
| `--loop-pause` | | Pause before loop restarts (ms) | `0` |
| `--pause-at-end` | `-p` | Pause at end before looping (ms) | `1000` |
| `--fade-duration` | | Fade duration for fade style (ms) | `1500` |
| `--rewind-speed` | | Speed multiplier for rewind | `5` |
| `--theme` | `-T` | Color theme | `dark` |
| `--template` | | Window style: `macos`, `windows`, `minimal` | `macos` |
| `--title` | `-t` | Window title | |
| `--width` | `-W` | Width in pixels | auto |
| `--height` | `-H` | Height in pixels | auto |
| `--font-size` | | Font size in pixels | `14` |
| `--font-family` | | Font family name | |
| `--line-height` | | Line height multiplier | `1.4` |
| `--padding` | | Content padding (px) | `16` |
| `--border-radius` | | Border radius (px) | `8` |
| `--border-color` | | Border color (hex) | |
| `--border-width` | | Border width (px) | |
| `--cursor-style` | | `block`, `bar`, `underline` | `block` |
| `--cursor-color` | | Cursor color (hex) | |
| `--cursor-blink` | | Enable cursor blink | `true` |
| `--watermark` | | Watermark text | |

---

## Examples

### Hello World

<img src="examples/svgs/everyday/demo.svg" width="600">

### ANSI Colors

Full 256-color and truecolor support.

<img src="examples/svgs/ansi/ansi-colors.svg" width="600">

### ASCII Art with Figlet

<img src="examples/svgs/ascii/figlet.svg" width="600">

### Charts with Chartscii

<img src="examples/svgs/everyday/chartscii.svg" width="600">

### Rainbow Animation

Animated command output is captured frame-by-frame.

<img src="examples/svgs/animated/rainbow-lolcat.svg" width="600">

### Git Log

<img src="examples/svgs/everyday/git-log.svg" width="600">

### System Info

<img src="examples/svgs/cursor/neofetch-theme-cursor.svg" width="600">

### Text Selection

<img src="examples/svgs/selection/selection-test.svg" width="600">

### Word Navigation

<img src="examples/svgs/navigation/word-navigation-test.svg" width="600">

### Color Tables

<img src="examples/svgs/ansi/colors-table.svg" width="600">

### Directory Listing

<img src="examples/svgs/everyday/ls-colors.svg" width="600">

See the [examples/](examples/) directory for all scripts and outputs.

---

## Why DVD?

| | DVD | VHS | asciinema |
|---|:---:|:---:|:---:|
| **Output** | SVG | GIF/MP4 | asciicast |
| **Dependencies** | None | ffmpeg, ttyd | Player embed |
| **File size** | Small | Large | Small |
| **Scalable** | Yes | No | Yes |
| **GitHub README** | Perfect | Works | Embed only |
| **Editable** | Yes (XML) | No | Yes (JSON) |
| **Offline** | Yes | Yes | No |
| **Print quality** | Yes | No | No |
| **Loop styles** | 4 modes | Basic | Basic |

---

## Related Projects

- [VHS](https://github.com/charmbracelet/vhs) - GIF/MP4 terminal recordings
- [shellfie](https://github.com/tool3/shellfie) - Terminal screenshots in code
- [shellfie-cli](https://github.com/tool3/shellfie-cli) - Terminal screenshots CLI
- [shellfied](https://github.com/tool3/shellfied) - Terminal screenshots web service

---

## License

MIT © [tool3](https://github.com/tool3)


![10](examples/svgs/fonts//font-size-10.svg)   
![20](examples/svgs/fonts//font-size-20.svg)   
![40](examples/svgs/fonts//font-size-40.svg)   
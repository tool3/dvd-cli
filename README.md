<p align="center">
  <img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/branding/intro_original.svg" alt="DVD - Terminal Recordings" >
</p>

<p align="center">
  <strong>Create animated SVG terminal recordings from simple scripts</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/dvd-cli"><img src="https://img.shields.io/badge/npm-v10-green" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/dvd-cli"><img src="https://img.shields.io/npm/dm/dvd-cli" alt="npm downloads"></a>
  <a href="https://github.com/tool3/dvd/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-MIT-orange" alt="license"></a>
</p>

DVD lets you create animated SVG terminal recordings from declarative `.cd` scripts.
Write what you want to happen, run `dvd`, and get a beautiful, infinitely-scalable animation.

**No ffmpeg. No browser. No dependencies. Just SVG.**

## Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Pipe Mode](#pipe-mode)
- [Recording](#recording)
- [Rendering Cast Files](#rendering-cast-files)
- [Syntax](#syntax)
  - [Commands](#commands)
  - [Settings](#settings)
- [Themes](#themes)
  - [Custom Themes](#custom-themes)
- [Templates](#templates)
- [Loop Styles](#loop-styles)
- [Animation Engines](#animation-engines)
- [CLI Reference](#cli-reference)
- [Examples](#examples)
- [Why DVD?](#why-dvd)
- [Related Projects](#related-projects)

---

## Installation
Note that bin is registered under `dvd` if installed.   
If you are using npx you must use the prefix: `npx dvdrw-cli`

### Homebrew (macOS/Linux)

```sh
brew install tool3/tap/dvd
```

### Shell script (macOS/Linux)

```sh
curl -fsSL https://raw.githubusercontent.com/tool3/dvd-cli/master/scripts/install.sh | bash
```

### npm

```sh
# Use directly with npx (no install needed)
npx dvdrw-cli --help

# Or install globally
npm install -g dvdrw-cli

# Or add to your project
npm install dvdrw-cli -D
```


## Quick Start

Create a new script:

```bash
dvd new demo
```

Edit `demo.cd`:

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

Render it:

```bash
dvd demo.cd
```

Your animated SVG works in GitHub READMEs, documentation sites, blogs - anywhere that supports images:

```markdown
![Demo](demo.svg)
```

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

<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/everyday/neofetch.svg" >

```bash
# simple chartscii chart with gradient and animation - dvd reverses and pauses between cycles
chartscii $(seq 1 5) -c "gradient(pink,cyan)" --animate | dvd -L reverse -P 1000 -w "made with dvd"
```

<!-- <img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/stdin/chartscii-sine.svg" ></br> -->
<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/stdin/chartscii-stdin.svg" ></br>

---

## Recording

Record an interactive terminal session to an asciinema-compatible `.cast` file. Every byte of output and input is captured with timing — exit the shell or press `Ctrl+D` to stop.

```bash
# Interactive recording (defaults to recording.cast)
dvd rec

# Custom output path
dvd rec session.cast

# One-shot, non-interactive: record a single command
dvd rec session.cast --command "ls -la --color"

# Embed a title in the cast metadata
dvd rec session.cast --title "Demo session"
```

The output is asciinema v2 format and works with any asciinema-compatible tool. Render it with `dvd render` (below).

---

## Rendering Cast Files

Convert a `.cast` recording into an animated SVG. Dimensions are auto-calculated from the recording's content.

```bash
# Render to <name>.svg
dvd render recording.cast

# Custom output and styling
dvd render recording.cast -o demo.svg --theme dracula --template macos --title "Demo"

# Disable the cursor entirely, bump the font, loop with reverse
dvd render recording.cast --no-cursor --font-size 16 --loop-style reverse
```

### Render Options

| Option            | Alias | Description                          | Default     |
| ----------------- | ----- | ------------------------------------ | ----------- |
| `--output`        | `-o`  | Output SVG path                      | `<file>.svg`|
| `--theme`         | `-T`  | Color theme                          | `dark`      |
| `--template`      | `-m`  | `macos`, `windows`, `minimal`        | `macos`     |
| `--title`         | `-t`  | Window title                         |             |
| `--font-size`     | `-s`  | Font size (px)                       | `14`        |
| `--line-height`   | `-Y`  | Line height multiplier               | `1.4`       |
| `--padding`       | `-d`  | Content padding (px)                 | `16`        |
| `--border-radius` | `-R`  | Window border radius (px)            | `8`         |
| `--cursor-blink`  |       | Enable cursor blink (off by default) | `false`     |
| `--no-cursor`     |       | Hide cursor entirely                 |             |
| `--custom-glyphs` | `-G`  | Render block elements as shapes      | `true`      |
| `--loop-style`    | `-L`  | `loop`, `reverse`, `rewind`, `fade`  | `loop`      |
| `--optimize`      | `-O`  | Optimize SVG output                  | `true`      |
| `--verbose`       | `-v`  | Verbose output                       | `false`     |

---

## Syntax

DVD scripts use a simple declarative syntax. Lines starting with `#` are comments.

### Commands

#### Type

Type text with realistic timing. Control speed with `@<ms>ms` suffix.

```
Type "echo 'Hello World'"
Type@100ms "Slow typing..."
Type@10ms "Speed typing!"
```

#### Enter

Execute the current command.

```
Type "neofetch"
Enter
```

#### Sleep

Pause the recording.

```
Sleep 500ms
Sleep 2s
```

#### Backspace

Delete characters. Supports a count parameter.

```
Type "Hello Wrold"
Backspace 4
Type "orld!"
```

<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/navigation/backspace.svg" >

#### Arrow Keys

Navigate with arrow keys. Supports a count parameter.

```
Left          # Move cursor left
Right         # Move cursor right
Left 5        # Move cursor left 5 times
Right 10      # Move cursor right 10 times
```

#### Keyboard Shortcuts

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

<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/navigation/keyboard-navigation-demo.svg" >

#### Screenshot

Capture a static frame at any point.

```
Type "npm test"
Enter
Screenshot test-results.svg
```

---

### Settings

All settings use the `Set` command: `Set <Setting> <value>`

#### Output

```
Output demo.svg
Output path/to/output.svg
```

#### Theme

```
Set Theme dracula
```

See the full [Themes](#themes) gallery below.

#### Template

Window chrome style.

```
Set Template macos     # macOS traffic lights
Set Template windows   # Windows-style buttons
Set Template minimal   # No window decorations
```

See [Templates](#templates) section for examples.

#### Title

```
Set Title "My Terminal"
```

#### Dimensions

Omit for auto-sizing based on content.

```
Set Width 800
Set Height 600
```

#### Font

```
# System font (viewer must have it installed)
Set FontFamily "Fira Code"
Set FontSize 14
Set LineHeight 1.4

# Embedded font (guaranteed to render correctly)
Set EmbedFont path/to/font.woff2
```

<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/fonts/embed-font-test.svg" />

<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/fonts/font-size-10.svg" ><br/>
<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/fonts/font-size-20.svg" > <br/>
<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/fonts/font-size-40.svg" > <br/>

#### Cursor

```
Set CursorStyle block      # block, bar, underline
Set CursorColor #ffffff
Set CursorBlink true
```

<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/cursor/cursor-style-test.svg" >

#### Typing Speed

Default milliseconds per character.

```
Set TypingSpeed 50
```

#### Prompt

Supports ANSI escape codes for colors.

```
Set PromptPrefix "$ "
Set PromptPrefix "❯ "
Set PromptPrefix "\x1b[95m❯\x1b[0m "    # Colored prompt
```

<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/prompt/custom-prompt.svg" >

#### Border

```
Set BorderRadius 8
Set BorderWidth 2
Set BorderColor #ff0000
```

<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/templates/border-test.svg" >

#### Padding

```
Set Padding 16
```

#### Header & Footer

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

<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/templates/header-footer-test.svg" >

#### Watermark

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

#### Shell

Set the shell for executing commands.

```
Set Shell /bin/zsh
Set Shell /bin/bash
```

#### Working Directory

Set the working directory for command execution.

```
Set WorkingDirectory $PWD           # Use current directory
Set WorkingDirectory /path/to/dir   # Use absolute path
```

#### Background & Gradient

Add a colored or gradient background around your terminal window.

```
# Solid color background
Set Background #1a1a2e
Set BackgroundPadding 40

# Vertical background (default)
Set Background gradient(#667eea, #764ba2)
Set BackgroundPadding 40

# Diagonal gradient (diagonal reversed)
Set Background gradient(#667eea, #764ba2)
Set BackgroundPadding 40

# Horizontal gradient
Set Background gradient(#f093fb, #f5576c:horizontal)
Set BackgroundPadding 40

# Multi-color gradient
Set Background gradient(#ff6b6b, #feca57, #48dbfb, #ff9ff3)
Set BackgroundPadding 60
```

<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/backgrounds/solid-background.svg" /> </br>
<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/backgrounds/vertical-gradient.svg" /> </br>
<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/backgrounds/gradient-background.svg" /></br>
<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/backgrounds/horizontal-gradient.svg" /> </br>

#### Playback Speed

Control animation playback speed.

```
Set PlaybackSpeed 2      # 2x faster
Set PlaybackSpeed 0.5    # Half speed
```

<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/speed/playback-speed-half.svg" /> </br>
<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/speed/playback-speed-1x.svg" /> </br>
<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/speed/playback-speed-2x.svg" /> </br>

---

## Themes

37 built-in themes.

```
Set Theme <theme-name>
```

<table>
<tr>
<td align="center"><strong>a11yDark</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/a11yDark.svg" ></td>
<td align="center"><strong>base16Dark</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/base16Dark.svg" ></td>
<td align="center"><strong>base16Light</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/base16Light.svg" ></td>
</tr>
<tr>
<td align="center"><strong>blackboard</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/blackboard.svg" ></td>
<td align="center"><strong>catppuccinMocha</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/catppuccinMocha.svg" ></td>
<td align="center"><strong>cobalt</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/cobalt.svg" ></td>
</tr>
<tr>
<td align="center"><strong>dark</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/dark.svg" ></td>
<td align="center"><strong>dracula</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/dracula.svg" ></td>
<td align="center"><strong>draculaPro</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/draculaPro.svg" ></td>
</tr>
<tr>
<td align="center"><strong>duotoneDark</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/duotoneDark.svg" ></td>
<td align="center"><strong>githubDark</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/githubDark.svg" ></td>
<td align="center"><strong>githubLight</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/githubLight.svg" ></td>
</tr>
<tr>
<td align="center"><strong>gruvboxDark</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/gruvboxDark.svg" ></td>
<td align="center"><strong>gruvboxLight</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/gruvboxLight.svg" ></td>
<td align="center"><strong>hopscotch</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/hopscotch.svg" ></td>
</tr>
<tr>
<td align="center"><strong>lucario</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/lucario.svg" ></td>
<td align="center"><strong>material</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/material.svg" ></td>
<td align="center"><strong>monokai</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/monokai.svg" ></td>
</tr>
<tr>
<td align="center"><strong>night3024</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/night3024.svg" ></td>
<td align="center"><strong>nord</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/nord.svg" ></td>
<td align="center"><strong>oceanicNext</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/oceanicNext.svg" ></td>
</tr>
<tr>
<td align="center"><strong>oneDark</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/oneDark.svg" ></td>
<td align="center"><strong>oneLight</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/oneLight.svg" ></td>
<td align="center"><strong>pandaSyntax</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/pandaSyntax.svg" ></td>
</tr>
<tr>
<td align="center"><strong>paraisoDark</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/paraisoDark.svg" ></td>
<td align="center"><strong>seti</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/seti.svg" ></td>
<td align="center"><strong>shadesOfPurple</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/shadesOfPurple.svg" ></td>
</tr>
<tr>
<td align="center"><strong>solarizedDark</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/solarizedDark.svg" ></td>
<td align="center"><strong>solarizedLight</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/solarizedLight.svg" ></td>
<td align="center"><strong>synthwave84</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/synthwave84.svg" ></td>
</tr>
<tr>
<td align="center"><strong>terminal</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/terminal.svg" ></td>
<td align="center"><strong>tokyoNight</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/tokyoNight.svg" ></td>
<td align="center"><strong>twilight</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/twilight.svg" ></td>
</tr>
<tr>
<td align="center"><strong>verminal</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/verminal.svg" ></td>
<td align="center"><strong>vscode</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/vscode.svg" ></td>
<td align="center"><strong>yeti</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/yeti.svg" ></td>
</tr>
<tr>
<td align="center"><strong>zenburn</strong><br><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/zenburn.svg" ></td>
<td></td>
<td></td>
</tr>
</table>

### Custom Themes

Create your own theme with a JSON object. Only specify the colors you want to override - unspecified colors inherit from the current theme.

```
# Full custom theme
Set Theme {"background": "#1a1a2e", "foreground": "#eaeaea", "cursor": "#f39c12", "red": "#e74c3c", "green": "#2ecc71", "blue": "#3498db"}

# Partial theme - just change background and foreground
Set Theme {"background": "#0d1117", "foreground": "#c9d1d9"}

# Retro green terminal
Set Theme {"background": "#0a0a0a", "foreground": "#00ff00", "cursor": "#00ff00"}
```

<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/custom-theme.svg" /> </br>
<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/themes/partial-theme-override.svg" /> </br>

**Available theme properties:**

| Property                                                                                                              | Description               |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `name`                                                                                                                | Theme name (optional)     |
| `background`                                                                                                          | Terminal background color |
| `foreground`                                                                                                          | Default text color        |
| `cursor`                                                                                                              | Cursor color              |
| `selection`                                                                                                           | Selection highlight color |
| `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`                                                 | Standard ANSI colors      |
| `brightBlack`, `brightRed`, `brightGreen`, `brightYellow`, `brightBlue`, `brightMagenta`, `brightCyan`, `brightWhite` | Bright ANSI colors        |

---

## Templates

Window chrome styles for your terminal.

```
Set Template <template-name>
```

<table>
<tr>
<td align="center"><strong>macos</strong><br>macOS traffic lights</td>
<td align="center"><strong>windows</strong><br>Windows-style buttons</td>
<td align="center"><strong>minimal</strong><br>No window decorations</td>
</tr>
<tr>
<td><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/templates/macos-style.svg" ></td>
<td><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/templates/windows-style.svg" ></td>
<td><img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/templates/templates.svg" ></td>
</tr>
</table>

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

<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/loop-style/loop-style-reverse-pause.svg" >

### Rewind

Fast reverse playback - like rewinding a tape.

```
Set LoopStyle rewind
Set RewindSpeed 10       # Speed multiplier (default: 5)
```

<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/loop-style/loop-style-rewind.svg" >

### Fade

Fade to black before restarting.

```
Set LoopStyle fade
Set FadeDuration 1500    # Fade duration in ms (default: 1500)
```

<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/loop-style/loop-style-fade.svg" >

### Loop Pause

Add a pause between animation cycles.

```
Set LoopPause 2000       # Pause 2 seconds before restarting
```

---

## Animation Engines

DVD ships with two animation engines. Filmstrip is the default and is the right choice for most recordings — SMIL is an opt-in alternative when you specifically need smoother playback on high-refresh-rate mobile displays.

### Filmstrip (default)

Each unique row in the recording is emitted once as an SVG `<symbol>` and referenced from every frame that uses it via `<use>`. Frame cadence is driven by CSS `@keyframes` with `step-end` visibility switching.

- **Smaller files.** Size scales with the number of *unique rows*, not frames. Repetitive output (prompts, ASCII art, mostly-static screens) compresses dramatically.
- **Great on desktop and modern browsers.** The CSS animation path is well-optimized where it matters for README/docs use.
- **Can stutter at 120Hz on mobile Safari.** Each frame switch goes through the browser's CSS style-resolution pipeline, which adds per-tick overhead on some devices.

No flag needed — this is what runs by default.

```bash
dvd script.cd
```

### SMIL

Each frame is emitted as its own `<g>` group, and visibility is switched by a native SVG `<animate attributeName="visibility">` tag. The SVG engine pre-computes the schedule and only paints the active frame.

- **Smoother on 120Hz / mobile Safari / iOS Chrome.** The native SVG animation path skips CSS style resolution entirely, so frame switches are cheaper per tick.
- **Larger files.** Size scales with *total frame count* rather than unique rows. Expect typically **2–4× the filmstrip output**, more for long/highly-varied recordings.
- **SMIL is less actively maintained in browser specs than CSS animations**, so this engine is a targeted tool rather than a future-proof default.

Enable with the `--smil` flag:

```bash
dvd script.cd --smil
```

### Which one should I use?

| You want…                                           | Use             |
| --------------------------------------------------- | --------------- |
| A README/docs embed on desktop                      | Filmstrip       |
| The smallest possible file                          | Filmstrip       |
| Buttery-smooth playback on iOS / 120Hz screens      | SMIL            |
| Long recordings with lots of repeated prompt lines  | Filmstrip       |
| Short, high-FPS animations where smoothness matters | SMIL            |

---

## CLI Reference

### Basic Usage

```bash
dvd script.cd                          # Render to script.svg
dvd script.cd -o output.svg            # Custom output path
dvd script.cd --verbose                # Show detailed output
```

### Loop Options

```bash
dvd script.cd --loop-style reverse     # Reverse animation
dvd script.cd --loop-style rewind      # Fast rewind
dvd script.cd --loop-style fade        # Fade to black
dvd script.cd --rewind-speed 10        # Rewind speed multiplier
dvd script.cd --fade-duration 2000     # Fade duration (ms)
dvd script.cd --loop-pause 1500        # Pause between loops (ms)
dvd script.cd --no-loop                # Play once, don't loop
dvd script.cd --pause-at-end 2000      # Pause at end before looping
```

### Styling Options

```bash
dvd script.cd --theme dracula
dvd script.cd --template macos
dvd script.cd --title "My Demo"
dvd script.cd --font-size 16
dvd script.cd --cursor-style bar
dvd script.cd --width 800 --height 600
```

### Pipe Mode

```bash
command | dvd -o output.svg
ls -la | dvd -o listing.svg --theme nord
```

### Utilities

```bash
dvd new my-demo                        # Create new script
dvd new my-demo --template showcase    # Use template
dvd themes                             # List themes
dvd validate script.cd                 # Validate without rendering
dvd rec session.cast                   # Record terminal session to .cast
dvd render session.cast -T dracula     # Render .cast file to SVG
```

### All Options

| Option                  | Alias | Description                         | Default       |
| ----------------------- | ----- | ----------------------------------- | ------------- |
| `--output`              | `-o`  | Output file path                    | `<input>.svg` |
| `--verbose`             | `-v`  | Show detailed output                | `false`       |
| `--optimize`            | `-O`  | Optimize SVG output                 | `true`        |
| `--smil`                |       | Use SMIL engine (see [Animation Engines](#animation-engines)) | `false` |
| `--loop`                | `-l`  | Loop the animation                  | `true`        |
| `--loop-style`          | `-L`  | `loop`, `reverse`, `rewind`, `fade` | `loop`        |
| `--loop-pause`          | `-P`  | Pause before loop restarts (ms)     | `0`           |
| `--pause-at-end`        | `-p`  | Pause at end before looping (ms)    | `1000`        |
| `--fade-duration`       | `-F`  | Fade duration for fade style (ms)   | `1500`        |
| `--rewind-speed`        | `-r`  | Speed multiplier for rewind         | `5`           |
| `--fps`                 | `-f`  | Frames per second                   |               |
| `--playback-speed`      | `-S`  | Animation playback speed multiplier | `1`           |
| `--theme`               | `-T`  | Color theme                         | `dark`        |
| `--template`            | `-m`  | `macos`, `windows`, `minimal`       | `macos`       |
| `--title`               | `-t`  | Window title                        |               |
| `--width`               | `-W`  | Width in pixels                     | auto          |
| `--height`              | `-H`  | Height in pixels                    | auto          |
| `--font-size`           | `-s`  | Font size in pixels                 | `14`          |
| `--font-family`         | `-y`  | Font family name                    |               |
| `--line-height`         | `-Y`  | Line height multiplier              | `1.4`         |
| `--letter-spacing`      | `-a`  | Letter spacing in pixels            | `0`           |
| `--padding`             | `-d`  | Content padding (px)                | `16`          |
| `--border-radius`       | `-R`  | Border radius (px)                  | `8`           |
| `--border-color`        | `-C`  | Border color (hex)                  |               |
| `--border-width`        | `-B`  | Border width (px)                   |               |
| `--background`          | `-A`  | Outer background color or gradient  |               |
| `--background-padding`  | `-n`  | Padding around terminal window (px) | `0`           |
| `--cursor-style`        | `-c`  | `block`, `bar`, `underline`         | `block`       |
| `--cursor-color`        | `-k`  | Cursor color (hex)                  |               |
| `--cursor-blink`        | `-K`  | Enable cursor blink                 | `true`        |
| `--header-background`   | `-b`  | Header background color (hex)       |               |
| `--header-height`       | `-e`  | Header height in pixels             |               |
| `--header-border`       | `-D`  | Show header border                  |               |
| `--header-border-color` | `-E`  | Header border color (hex)           |               |
| `--header-border-width` | `-G`  | Header border width (px)            |               |
| `--footer-background`   | `-g`  | Footer background color (hex)       |               |
| `--footer-height`       | `-i`  | Footer height in pixels             |               |
| `--footer-border`       | `-I`  | Show footer border                  |               |
| `--footer-border-color` | `-J`  | Footer border color (hex)           |               |
| `--footer-border-width` | `-j`  | Footer border width (px)            |               |
| `--watermark`           | `-w`  | Watermark text                      |               |

---

## Examples

### Hello World

<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/everyday/demo.svg" >

```
Output demo.svg

Set Template minimal
Set FontSize 46

Type "echo 'Hello world'"
Sleep 500ms
Enter
Type "Welcome to DVD!"
Sleep 1s
```

### ANSI Colors

Full 256-color and truecolor support.

<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/ansi/ansi-colors.svg" >

### ASCII Art with Figlet

<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/ascii/figlet.svg" >

### Charts with Chartscii

<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/everyday/chartscii.svg" >

### Rainbow Animation

Animated command output is captured frame-by-frame.

<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/animated/rainbow-lolcat.svg" >

### Git Log

<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/everyday/git-log.svg" >

### System Info

<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/cursor/neofetch-theme-cursor.svg" >

### Text Selection

<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/selection/selection-test.svg" >

### Word Navigation

<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/navigation/word-navigation-test.svg" >

### Color Tables

<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/ansi/colors-table.svg" >

### Directory Listing

<img src="https://github.com/tool3/dvd-cli/blob/master/examples/svgs/everyday/ls-colors.svg" >

See the [examples/](examples/) directory for all scripts and outputs.

---

## Why DVD?

|                   |    DVD    |     VHS      |  asciinema   |
| ----------------- | :-------: | :----------: | :----------: |
| **Output**        |    SVG    |   GIF/MP4    |  asciicast   |
| **Dependencies**  |   None    | ffmpeg, ttyd | Player embed |
| **Scalable**      |    Yes    |      No      |     Yes      |
| **GitHub README** |  Perfect  |    Works     |  Embed only  |
| **Editable**      | Yes (XML) |      No      |  Yes (JSON)  |
| **Offline**       |    Yes    |     Yes      |      No      |
| **Print quality** |    Yes    |      No      |      No      |
| **Loop styles**   |  4 modes  |    Basic     |    Basic     |

---

## Related Projects

- [VHS](https://github.com/charmbracelet/vhs) - GIF/MP4 terminal recordings
- [dvd](https://github.com/tool3/dvd) - The dvd lib
- [shellfie](https://github.com/tool3/shellfie) - Terminal screenshots in code
- [shellfie-cli](https://github.com/tool3/shellfie-cli) - Terminal screenshots CLI
- [shellfied](https://github.com/tool3/shellfied) - Terminal screenshots web service

---

## License

MIT

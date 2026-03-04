# .cd File Format Specification

The `.cd` (Cinema Display) format is a declarative scripting language for creating animated SVG terminal recordings.

## File Structure

A `.cd` file consists of:
1. **Output declaration** (optional)
2. **Settings** (optional)
3. **Requirements** (optional)
4. **Commands** (required)

```
# Comments start with #
Output demo.svg

Set Width 800
Set Height 600
Set Theme dracula

Type "echo 'Hello World'"
Enter
Sleep 1s
```

## Commands

### Output

Specify the output SVG file path.

```
Output path/to/output.svg
```

If not specified, defaults to `<input-filename>.svg` or the `-o` CLI option.

### Require

Declare required programs (for documentation purposes).

```
Require npm
Require node
```

### Set

Configure terminal appearance and behavior.

#### Display Settings

```
Set Width 800           # Terminal width in pixels
Set Height 600          # Terminal height in pixels
Set FontSize 16         # Font size in pixels
Set LetterSpacing 0     # Letter spacing in pixels
Set LineHeight 1.4      # Line height multiplier
Set Padding 16          # Terminal padding in pixels
```

#### Appearance

```
Set Title "My Demo"                    # Terminal title
Set Theme dracula                      # Color theme
Set Template macos                     # Terminal template (macos, windows, minimal)
Set Watermark "\\x1b[32mby user\\x1b[0m"  # Watermark text (supports ANSI)
Set PromptPrefix "\\x1b[95m❯\\x1b[0m "     # Shell prompt (supports ANSI)
```

#### Behavior

```
Set TypingSpeed 50      # Typing delay per character (ms)
Set CursorBlink true    # Enable/disable cursor blinking
Set Shell bash          # Shell type (for documentation)
```

### Type

Simulate typing text.

```
Type "echo 'Hello World'"
Type "Multi-line\ntext"
Type "With \ttabs"
```

**ANSI Escape Sequences:**
- `\\x1b` - ESC character
- `\\e` - ESC character (alternative)
- `\\n` - Newline
- `\\t` - Tab

### Special Keys

```
Enter           # Press Enter
Backspace       # Press Backspace (repeat: Backspace 5)
Space           # Press Space (repeat: Space 3)
Tab             # Press Tab
```

### Arrow Keys

```
Left            # Move cursor left (repeat: Left 5)
Right           # Move cursor right (repeat: Right 3)
Up              # Move up in history
Down            # Move down in history
```

### Keyboard Shortcuts

Combine modifiers with keys:

```
# Text selection
Shift+Left      # Select character to the left
Shift+Right     # Select character to the right

# Word movement
Alt+Left        # Move to previous word
Alt+Right       # Move to next word

# Word selection
Alt+Shift+Left  # Select previous word
Alt+Shift+Right # Select next word

# Line navigation
Cmd+Left        # Move to beginning of line
Cmd+Right       # Move to end of line
Ctrl+A          # Alternative for line start
Ctrl+E          # Alternative for line end

# Word deletion
Cmd+Backspace   # Delete previous word
Ctrl+W          # Alternative word delete

# Other shortcuts
Ctrl+C          # Send SIGINT
Ctrl+D          # Send EOF
Cmd+K           # Clear to end of line
```

**Modifiers:**
- `Ctrl` - Control key
- `Alt` - Alt/Option key
- `Shift` - Shift key
- `Cmd` - Command key (macOS) / Windows key

### Timing

```
Sleep 1s        # Sleep for 1 second
Sleep 500ms     # Sleep for 500 milliseconds
Sleep 2.5s      # Sleep for 2.5 seconds
```

### Screenshot

Capture a static SVG frame at the current state.

```
Screenshot frame.svg
Screenshot               # Auto-generates filename
```

Auto-generated filenames follow the pattern: `screenshot-1.svg`, `screenshot-2.svg`, etc.

### Clipboard (Future)

```
Copy            # Copy selected text to clipboard
Paste           # Paste from clipboard
```

### Environment (Future)

```
Env KEY value   # Set environment variable
```

### Visibility (Future)

```
Hide            # Hide subsequent commands from output
Show            # Resume showing commands
```

### Wait (Future)

```
Wait 1s                     # Wait for duration
Wait /regex/                # Wait for text matching regex
Wait+Screen /pattern/       # Wait for screen to match
Wait+Line /pattern/         # Wait for line to match
```

## Themes

Available themes:
- `catppuccinMocha`
- `dracula`
- `githubDark`
- `githubLight`
- `gruvboxDark`
- `gruvboxLight`
- `monokai`
- `nord`
- `oneDark`
- `solarizedDark`
- `solarizedLight`
- `tokyoNight`
- `terminal`

## Templates

Available templates:
- `macos` - macOS-style terminal with traffic light buttons
- `windows` - Windows terminal style
- `minimal` - Clean, minimal design

## Comments

Lines starting with `#` are comments and are ignored.

```
# This is a comment
Type "Hello"  # Inline comments are supported
```

## Examples

### Basic Example

```
Output hello.svg

Set Width 800
Set Height 600
Set Theme dracula
Set Title "Hello World"

Type "echo 'Hello, World!'"
Enter
Sleep 1s
```

### Keyboard Navigation

```
Output keyboard.svg

Set Theme nord
Set Width 900
Set Height 600

Type "The quick brown fox"
Sleep 500ms

# Select "fox"
Left 3
Shift+Right
Shift+Right
Shift+Right
Sleep 500ms

# Replace with "cat"
Type "cat"
Sleep 1s
```

### Multiple Commands

```
Output demo.svg

Set Theme tokyoNight
Set Width 1000
Set Height 700

Type "npm install"
Enter
Sleep 2s

Type "npm test"
Enter
Sleep 3s

Screenshot test-results.svg
```

## Best Practices

1. **Always specify Output** - Makes scripts self-documenting
2. **Use meaningful Sleep durations** - 500ms-1s for user actions, 2-3s for command output
3. **Add comments** - Explain complex sequences
4. **Use ANSI colors** - Make prompts and output colorful
5. **Capture screenshots** - Save important frames for static use
6. **Test scripts** - Use `dvd validate script.cd` before rendering

## File Extensions

- `.cd` - Cinema Display script file
- `.svg` - Output animated SVG file

## Error Handling

The parser will report:
- Line numbers for syntax errors
- Unknown command names
- Invalid durations
- Mismatched quotes

Use `dvd validate script.cd` to check for errors before rendering.

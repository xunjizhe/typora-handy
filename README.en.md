# typora-handy

[简体中文](README.md) | **English**

[Usage](#usage) · [Windows installation](#windows-installation) · [Uninstall](#uninstall) · [Compatibility](#compatibility) · [License](#license) · [Feedback and support](#feedback-and-support)

## Usage

A lightweight text color and image adjustment plugin for Typora. Color text from the native context menu, move images freely, and resize them proportionally with corner handles. No additional plugin framework is required.

| Feature | How to use it |
| --- | --- |
| Text color | Select text and choose a color in the native context menu |
| Image movement | Click an image, then drag it or its blue outline |
| Image resizing | Drag a corner handle to preserve the current aspect ratio |

### Text color

Select text → Right-click → Choose a swatch above “Search with Google.”

Six colors are available: red, orange, green, blue, purple, and gray. There is no floating button or keyboard shortcut binding. The menu adjusts its position based on the selection and available window space to avoid covering the selected text where possible.

Colors are saved in your Markdown document as HTML tags, for example:

```html
<span style="color: #e53935">Text to emphasize</span>
```

Preview:

![Six text color swatches in Typora's context menu](pic/context-menu-colors.png)

### Image adjustment

1. Click an image in normal editing mode to show a blue outline and four corner handles.
2. Drag the image or its outline to move it in any direction. Drag any corner to resize it while keeping its current aspect ratio.
3. Release the mouse to apply the change. Press `Esc` during a drag to cancel it; press `Esc` again to dismiss the controls.
4. Use Typora's undo command to revert an applied change.

Free movement uses a visual offset from the image's original layout position: **the original space remains reserved, and moved images may overlap other document content**. It does not reorder paragraphs or automatically wrap text around images. Other readers and export formats may render the layout differently depending on HTML style support. Image controls are disabled in code blocks, HTML blocks, source mode, and locked documents.

## Windows installation

1. Download or clone this project.

2. Close Typora completely.

3. Open PowerShell **as administrator** and run the command below (<span style="color: #e53935">make sure to replace the path with the actual location of the extracted project</span>):

   **PowerShell:**

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File "path\to\the\extracted\project\install.ps1"
   ```
   **Updating the plugin:** Close Typora completely and run the installer again using the updated project files. Reinstalling replaces the plugin files without adding duplicate script tags.

## Uninstall

Close Typora completely, open PowerShell as administrator in the project folder, and run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Uninstall
```

If you specified an installation folder manually, you can also pass `-TyporaPath "your Typora installation folder"` when uninstalling.

Uninstalling removes the plugin's script tags and JavaScript files while keeping the backup and other modifications. Saved colors, image positions, and dimensions remain in your documents.

## Compatibility

- Installation scripts are currently provided for Windows. Installing and uninstalling require write access to Typora's installation folder, which usually requires administrator privileges.
- Supports selections within a single paragraph in normal editing mode. Source mode, code blocks, and selections across paragraphs are not supported. A word automatically selected by Typora when you right-click can also be colored.
- To simplify the context menu, the plugin hides spelling suggestions and dictionary actions in that menu. It does not disable spell checking in the document.
- The plugin uses Typora's internal editing interfaces, so compatibility may require adjustments between versions. If a Typora update replaces `window.html`, run the installer again.
- Colors are stored as HTML tags. Their appearance in other Markdown readers depends on support for inline HTML and styles.

## License

The project code is licensed under the [Apache License 2.0](LICENSE).

## Feedback and support

Issues, bug reports, and suggestions are welcome. If you find this little plugin useful, consider giving it a Star!

<img src="pic/closing-illustration.jpg" alt="Thanks for using typora-handy" data-tint-x="-411" data-tint-y="-1" style="translate: -411px -1px; width: 309px; height: 168px; max-width: none; max-height: none; zoom: 1;">

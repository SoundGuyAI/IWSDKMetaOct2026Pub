/**
 * Main-menu button layout (cover landing, Nov 19): flat desktop shows the four
 * buttons (Start, Enter XR, Lab, Settings) in one frameless horizontal row,
 * phone and MR keep them stacked inside the framed panel, and the Settings /
 * Accessibility dialogs always get the framed 520-wide panel.
 */
export type MainMenuShape = 'row' | 'stack' | 'dialog';

type Props = Record<string, unknown>;
type MenuPanel = {
  getElementById: (id: string) => { setProperties: (p: never) => void } | null | undefined;
};

let currentShape: MainMenuShape = 'stack';
let revision = 0;

/** Bumps whenever the menu shape changes, so placement can follow it. */
export function mainMenuLayoutRevision(): number {
  return revision;
}

/** True while the Settings or Accessibility dialog replaces the buttons. */
export function isMainMenuDialogOpen(): boolean {
  return currentShape === 'dialog';
}

/** Shape the menu returns to when a dialog closes. */
export function currentMainMenuShape(): MainMenuShape {
  return currentShape === 'dialog' ? lastMenuShape : currentShape;
}
let lastMenuShape: MainMenuShape = 'stack';

/** Quest browser, flat page: Start says (Flat); everywhere else it is plain. */
export function startButtonLabel(is2D: boolean, userAgent: string): string {
  return is2D && /Quest|Oculus/i.test(userAgent)
    ? 'Start Wall Tones (Flat)'
    : 'Start Wall Tones';
}

const FRAME: Props = {
  backgroundColor: 'rgba(6, 12, 24, 0.55)',
  borderWidth: 2,
  borderColor: 'rgba(120, 160, 255, 0.45)',
};
const FRAMELESS: Props = {
  backgroundColor: 'rgba(0, 0, 0, 0)',
  borderWidth: 0,
  borderColor: 'rgba(0, 0, 0, 0)',
};

export function applyMainMenuShape(panel: MenuPanel, shape: MainMenuShape): void {
  if (shape !== currentShape) {
    revision += 1;
  }
  currentShape = shape;
  if (shape !== 'dialog') {
    lastMenuShape = shape;
  }
  const set = (id: string, props: Props) =>
    panel.getElementById(id)?.setProperties(props as never);
  const row = shape === 'row';
  set('main-menu-root', {
    width: row ? 1180 : 520,
    ...(row ? FRAMELESS : FRAME),
  });
  set('main-menu-buttons', {
    flexDirection: row ? 'row' : 'column',
    justifyContent: 'center',
    alignItems: row ? 'center' : 'stretch',
    gap: row ? 22 : 0,
  });
  if (row) {
    const widths: Record<string, number> = {
      'mode-walltones-button': 340,
      'xr-button': 250,
      'lab-entry-button': 200,
      'settings-button': 250,
    };
    for (const id of Object.keys(widths)) {
      set(id, {
        width: widths[id],
        height: 64,
        marginLeft: 0,
        marginRight: 0,
        marginBottom: 0,
        marginTop: 0,
        paddingTop: 14,
        paddingBottom: 14,
      });
    }
  } else {
    for (const id of ['mode-walltones-button', 'lab-entry-button', 'settings-button']) {
      set(id, {
        width: undefined,
        height: 64,
        marginLeft: 24,
        marginRight: 24,
        marginBottom: id === 'settings-button' ? 10 : 12,
        marginTop: 0,
      });
    }
    set('xr-button', {
      width: undefined,
      marginLeft: 20,
      marginRight: 20,
      marginTop: 10,
      marginBottom: 28,
    });
  }
  set('main-menu-credit', { marginTop: row ? 18 : 0 });
}

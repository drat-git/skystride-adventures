import Phaser from 'phaser';
/** Phaser 3.90's core visibility handler has no teardown. Scope its synchronous
 * boot registrations so repeated previews release those handlers as well. */
export class ManagedGame extends Phaser.Game {
  private releaseCoreListeners?: () => void;
  private released = false;

  protected start() {
    const add = document.addEventListener;
    const previousBlur = window.onblur, previousFocus = window.onfocus;
    const visibility: { type: string; listener: EventListenerOrEventListenerObject; options?: boolean | AddEventListenerOptions }[] = [];
    document.addEventListener = function (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
      if (type.endsWith('visibilitychange')) visibility.push({ type, listener, options });
      add.call(document, type, listener, options);
    } as typeof document.addEventListener;
    try { super.start(); }
    finally { document.addEventListener = add; }
    const blur = window.onblur, focus = window.onfocus;
    // Keep application-owned event properties intact; our Phaser callbacks get
    // normal removable subscriptions instead of replacing window handlers.
    window.onblur = previousBlur; window.onfocus = previousFocus;
    if (blur) window.addEventListener('blur', blur);
    if (focus) window.addEventListener('focus', focus);
    let active = true;
    this.releaseCoreListeners = () => {
      if (!active) return;
      active = false;
      for (const hook of visibility) document.removeEventListener(hook.type, hook.listener, hook.options);
      if (blur) window.removeEventListener('blur', blur);
      if (focus) window.removeEventListener('focus', focus);
    };
    this.events.once(Phaser.Core.Events.DESTROY, this.releaseCoreListeners);
    if (this.released) this.releaseCoreListeners();
  }

  releaseDomListeners() { this.released = true; this.releaseCoreListeners?.(); }
}

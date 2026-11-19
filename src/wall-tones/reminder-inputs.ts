import { HeadNodShakeDetector, FLAT_HEAD_GESTURE_CONFIG } from '../nod-lab/head-gesture.js';
import { ThumbGestureDetector, type ThumbHandJoints } from '../thumbs-lab/thumbs-gesture.js';
import { PointerGestureTracker } from '../nod-lab/pointer-gesture.js';
import { TiltBaselineTracker, requestTiltPermission } from '../nod-lab/tilt-gesture.js';
import type { ReminderAnswer } from './return-reminders.js';

/** A bounded, first-answer-wins prompt. Reuses existing detectors, not speech recognition. */
export class ReminderInputs {
  private settle: ((answer: ReminderAnswer) => void) | null = null;
  private head = new HeadNodShakeDetector();
  private thumbs = new ThumbGestureDetector();
  private pointer = new PointerGestureTracker();
  private tilt = new TiltBaselineTracker();
  private flatPointer = new HeadNodShakeDetector(FLAT_HEAD_GESTURE_CONFIG);
  private flatTilt = new HeadNodShakeDetector(FLAT_HEAD_GESTURE_CONFIG);
  private detach: (() => void) | null = null;
  get listening(): boolean { return this.settle !== null; }
  /** Must be called from an actual Start/open-context button gesture on iOS. */
  requestTilt(): void { void requestTiltPermission(); }
  ask(target: Window, immersive: boolean, timeoutMs = 6000): Promise<ReminderAnswer> {
    this.cancel();
    this.head.reset();this.thumbs.reset();this.pointer.reset();this.tilt.reset();
    this.head.setEnabled(immersive);this.thumbs.setEnabled(immersive);
    this.flatPointer.reset();this.flatPointer.setEnabled(!immersive);
    this.flatTilt.reset();this.flatTilt.setEnabled(!immersive);
    return new Promise(resolve => {
      const finish = (answer: ReminderAnswer) => {
        if (this.settle !== finish) return;
        this.settle = null;this.detach?.();this.detach=null;resolve(answer);
      };
      this.settle=finish;
      const move=(e: PointerEvent)=>{
        if(immersive)return;
        const now=performance.now()/1000,s=this.pointer.feed(e.clientX,e.clientY,now);
        if(this.pointer.consumeReprime())this.flatPointer.reset();
        const event=this.flatPointer.feed(s.pitchDeg*Math.PI/180,s.yawDeg*Math.PI/180,now);
        if(event)this.answer(event.answer);
      };
      const orientation=(e: DeviceOrientationEvent)=>{
        if(immersive)return;
        const s=this.tilt.feed(e.beta,e.gamma,target.screen?.orientation?.angle??0);
        if(!s)return;
        const event=this.flatTilt.feed(s.pitchDeg*Math.PI/180,s.yawDeg*Math.PI/180,performance.now()/1000);
        if(event)this.answer(event.answer);
      };
      const key=(e:KeyboardEvent)=>{
        if(e.key.toLowerCase()==='y')this.answer('yes');
        if(e.key.toLowerCase()==='n'||e.key==='Escape')this.answer('no');
      };
      const hidden=()=>{if(target.document.hidden)this.cancel();};
      target.addEventListener('pointermove',move);target.addEventListener('deviceorientation',orientation);target.addEventListener('keydown',key);target.document.addEventListener('visibilitychange',hidden);
      const timer=target.setTimeout(()=>finish(null),timeoutMs);
      this.detach=()=>{target.clearTimeout(timer);target.removeEventListener('pointermove',move);target.removeEventListener('deviceorientation',orientation);target.removeEventListener('keydown',key);target.document.removeEventListener('visibilitychange',hidden);};
    });
  }
  /** Feed visible immersive frames only. First head OR thumb event closes both. */
  feedImmersive(pitch: number | null,yaw: number | null,left:ThumbHandJoints|null,right:ThumbHandJoints|null,now:number): void {
    if(!this.listening)return;
    const event=pitch!=null&&yaw!=null?this.head.feed(pitch,yaw,now):null;
    if(event){this.answer(event.answer);return;}
    const thumb=this.thumbs.feed(left,right,now);if(thumb)this.answer(thumb.answer);
  }
  answer(answer:'yes'|'no'): void { this.settle?.(answer); }
  cancel(): void { this.settle?.(null); }
}

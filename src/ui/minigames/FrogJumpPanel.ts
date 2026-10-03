import type { Game } from '../../game/engine/Game';
import { MiniGamePanel } from '../MiniGamePanel';

// STUB — to be implemented.
export class FrogJumpPanel extends MiniGamePanel {
  constructor(game: Game) {
    super(game, 'frogJump');
  }

  protected start() {
    this.setCard(this.def.name, '');
    this.setStatus(this.bestLine());
    this.playingActions();
  }

  protected update(_dt: number, _t: number) {}

  protected draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#3f7a3c';
    ctx.fillRect(0, 0, this.cw, this.ch);
  }
}

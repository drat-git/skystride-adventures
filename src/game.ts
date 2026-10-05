import Phaser from 'phaser';
import { TILE, COLS, ROWS, validateLayout, type Level } from './level';
import { Attempt } from './attempt';
export class CourseScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string,Phaser.Input.Keyboard.Key>;
  private attempt = new Attempt();
  private status!: Phaser.GameObjects.Text;
  constructor(private level: Level, private onFinish: (elapsed:number,deaths:number)=>void) { super('course'); }
  create() {
    const layout=this.level.layout;
    this.cameras.main.setBackgroundColor('#dceee9');
    const g=this.add.graphics();
    g.fillStyle(0xb7d3cb,1);g.fillTriangle(0,384,170,170,340,384);g.fillTriangle(250,384,510,110,768,384);
    g.fillStyle(0xc9e1d9,1);g.fillCircle(600,80,42);
    g.fillStyle(0xf3c35c,1);g.fillRect(0,0,24,28);g.generateTexture('player',24,28);g.clear();
    g.fillStyle(0x234740,1);g.fillRect(0,0,32,32);g.fillStyle(0x76a58c,1);g.fillRect(0,0,32,5);g.generateTexture('platform',32,32);g.clear();
    const solids=this.physics.add.staticGroup();
    for(const p of layout.platforms) for(let i=0;i<p.width;i++) solids.create((p.x+i)*TILE+16,p.y*TILE+16,'platform');
    this.player=this.physics.add.sprite(layout.start.x*TILE+16,layout.start.y*TILE+16,'player');
    this.player.setCollideWorldBounds(true);this.player.body!.setSize(22,28);
    this.physics.add.collider(this.player,solids);
    for(const h of layout.hazards) {
      this.add.triangle(h.x*TILE+16,h.y*TILE+24,0,18,14,0,28,18,0xd46b57);
      const zone=this.add.zone(h.x*TILE+16,h.y*TILE+24,24,16);this.physics.add.existing(zone,true);
      this.physics.add.overlap(this.player,zone,()=>this.respawn());
    }
    this.add.rectangle(layout.finish.x*TILE+7,layout.finish.y*TILE+5,4,44,0x244c44);
    this.add.triangle(layout.finish.x*TILE+23,layout.finish.y*TILE-7,0,0,24,10,0,20,0xeaa849);
    const goal=this.add.zone(layout.finish.x*TILE+16,layout.finish.y*TILE+16,26,30);this.physics.add.existing(goal,true);
    this.physics.add.overlap(this.player,goal,()=>{
      if(this.attempt.finish()){this.player.setVelocity(0);this.physics.pause();this.onFinish(Math.round(this.attempt.elapsedMs),this.attempt.deaths);}
    });
    this.status=this.add.text(18,16,'',{fontFamily:'monospace',fontSize:'16px',color:'#173e36',backgroundColor:'#f3faf6',padding:{x:10,y:7}});
    this.cursors=this.input.keyboard!.createCursorKeys();
    this.keys=this.input.keyboard!.addKeys('A,D,W') as Record<string,Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.addCapture(['UP','LEFT','RIGHT','SPACE']);
    const hidden=()=>{ if(document.hidden) this.setPaused(true); };
    document.addEventListener('visibilitychange',hidden);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>document.removeEventListener('visibilitychange',hidden));
    this.events.once(Phaser.Scenes.Events.DESTROY,()=>document.removeEventListener('visibilitychange',hidden));
  }
  private respawn() {
    if(this.attempt.finished || this.attempt.paused)return;
    this.attempt.die();const p=this.level.layout.start;
    this.player.setPosition(p.x*TILE+16,p.y*TILE+16).setVelocity(0);
  }
  setPaused(paused:boolean) {
    if(this.attempt.finished)return;
    this.attempt.paused=paused;
    if(paused){this.player.setVelocity(0);this.physics.pause();}else this.physics.resume();
    this.game.events.emit('pause-changed',paused);
  }
  update(_time:number,delta:number) {
    this.attempt.tick(delta);
    this.status.setText(`${(this.attempt.elapsedMs/1000).toFixed(1)}s   ${this.attempt.deaths} deaths${this.attempt.paused?'   PAUSED':''}`);
    if(this.attempt.paused || this.attempt.finished)return;
    const left=this.cursors.left.isDown || this.keys.A.isDown,right=this.cursors.right.isDown || this.keys.D.isDown;
    this.player.setVelocityX(left===right?0:left?-210:210);
    const jump=Phaser.Input.Keyboard.JustDown(this.cursors.up)||Phaser.Input.Keyboard.JustDown(this.cursors.space)||Phaser.Input.Keyboard.JustDown(this.keys.W);
    if(jump && (this.player.body as Phaser.Physics.Arcade.Body).blocked.down)this.player.setVelocityY(-410);
    if(this.player.y>ROWS*TILE-30)this.respawn();
  }
}
export function mountGame(parent: HTMLElement,level:Level,onFinish:(elapsed:number,deaths:number)=>void) {
  validateLayout(level.layout);
  const scene=new CourseScene(level,onFinish);
  const game=new Phaser.Game({type:Phaser.AUTO,parent,width:COLS*TILE,height:ROWS*TILE,
    scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},
    physics:{default:'arcade',arcade:{gravity:{x:0,y:950},debug:false}},scene:[scene],render:{pixelArt:true},banner:false});
  return {game,scene,destroy:()=>{game.destroy(true);}};
}

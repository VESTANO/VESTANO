import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reorderCards, reorderVisibleCards, resizeCardWidth, applyCardLayout, applyCanvasFrames, canvasHeight, normalizeCanvasFrame, planLayoutUpdates, newPreviewId } from '../assets/js/news-layout.js';

test('dragging places a story before or after a target without duplicating it', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assert.deepEqual(reorderCards(ids, 'a', 'c', 'after'), ['b','c','a','d']);
  assert.deepEqual(reorderCards(ids, 'd', 'b', 'before'), ['a','d','b','c']);
  assert.deepEqual(ids, ['a','b','c','d']);
  assert.deepEqual(reorderCards(ids, 'b', 'b'), ids);
  assert.throws(() => reorderCards(ids, 'unknown', 'a'), /Choose a story/);
});
test('moving published cards preserves the slots of hidden drafts', () => {
  assert.deepEqual(reorderVisibleCards(['a','draft','b','c'], ['a','b','c'], 'a','c','after'), ['b','draft','c','a']);
});
test('resizing snaps to valid responsive spans and supports shrinking', () => {
  assert.equal(resizeCardWidth('standard',300,324,300,24,3),'wide');
  assert.equal(resizeCardWidth('standard',300,648,300,24,3),'full');
  assert.equal(resizeCardWidth('full',948,-648,300,24,3),'standard');
  assert.equal(resizeCardWidth('standard',300,4000,300,24,3),'full');
  assert.equal(resizeCardWidth('full',624,0,300,24,2),'full');
});
const posts = [
  { id:'a', status:'published', display_order:0, card_width:'standard', updated_at:'one', title:'Original title', body:'Original body' },
  { id:'b', status:'published', display_order:1, card_width:'standard', updated_at:'two' },
  { id:'draft', status:'draft', display_order:2, card_width:'standard', updated_at:'three' },
  { id:'deleted', status:'deleted', display_order:3, card_width:'standard' },
];
test('layout preview is immutable and applies changes only to the target story', () => {
  const result = applyCardLayout(posts, ['b','a','draft'], new Map([['a','wide']]));
  assert.equal(result[0].id,'b'); assert.equal(result[1].card_width,'wide');
  assert.equal(posts[0].card_width,'standard'); assert.equal(result[1].body,'Original body');
});
test('saving a layout updates geometry only and keeps revision checks', () => {
  const updates = planLayoutUpdates(posts,['b','a','draft'],new Map([['a','full']]));
  assert.deepEqual(updates,[{id:'a',updated_at:'one',values:{display_order:1,card_width:'full'}},{id:'b',updated_at:'two',values:{display_order:0}}]);
});
test('a width-only save preserves existing ordering', () => {
  assert.deepEqual(planLayoutUpdates(posts,null,new Map([['b','wide']])),[{id:'b',updated_at:'two',values:{card_width:'wide'}}]);
});
test('new unsaved stories and stale or invalid layouts are rejected before writes', () => {
  assert.throws(()=>planLayoutUpdates(posts,[newPreviewId,'a','b','draft'],new Map()),/Save the new story/);
  assert.throws(()=>planLayoutUpdates(posts,['a','b'],new Map()),/story list changed/);
  assert.throws(()=>planLayoutUpdates(posts,['a','a','b'],new Map()),/story list changed/);
  assert.throws(()=>planLayoutUpdates(posts,null,new Map([['deleted','wide']])),/story was removed/);
  assert.throws(()=>planLayoutUpdates(posts,null,new Map([['a','999px']])),/supported card width/);
});
test('retrying after a partial save writes only the remaining changes', () => {
  const partial = posts.map(post=>post.id==='a'?{...post,display_order:1,card_width:'full',updated_at:'new'}:post);
  assert.deepEqual(planLayoutUpdates(partial,['b','a','draft'],new Map([['a','full']])),[{id:'b',updated_at:'two',values:{display_order:0}}]);
});
test('freeform frames snap to the safe canvas and persist geometry only', () => {
  const framed = applyCanvasFrames(posts.filter(post => post.status !== 'deleted'));
  assert.deepEqual(normalizeCanvasFrame(framed[0]), { x:0, y:0, width:4, height:46 });
  assert.equal(canvasHeight(framed), 50);
  const frames = new Map([['a',{x:5,y:12,width:6,height:52}]]);
  assert.deepEqual(planLayoutUpdates(posts,null,new Map(),frames), [{ id:'a',updated_at:'one',values:{layout_x:5,layout_y:12,layout_width:6,layout_height:52} }]);
  assert.equal(normalizeCanvasFrame({x:10,y:0,width:3,height:40}), null);
  assert.throws(() => planLayoutUpdates(posts,null,new Map([['a','wide']]),new Map([['deleted',{x:0,y:0,width:4,height:40}]])), /story was removed/);
});

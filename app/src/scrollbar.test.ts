// node --test src/scrollbar.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { percent, scrollForThumbLeft, scrollForTrackClick, thumbMetrics } from './scrollbar.ts';

test('conteúdo que cabe: sem barra', () => {
  assert.equal(thumbMetrics(0, 300, 300, 300).visible, false);
  assert.equal(thumbMetrics(0, 300, 300.5, 300).visible, false);
});
test('tamanho do marcador proporcional e com mínimo', () => {
  assert.equal(thumbMetrics(0, 300, 600, 300).thumbWidth, 150);
  assert.equal(thumbMetrics(0, 300, 6000, 300).thumbWidth, 48);
});
test('posição do marcador nas pontas e no meio', () => {
  assert.equal(thumbMetrics(0, 300, 600, 300).thumbLeft, 0);
  assert.equal(thumbMetrics(150, 300, 600, 300).thumbLeft, 75);
  assert.equal(thumbMetrics(300, 300, 600, 300).thumbLeft, 150);
  assert.equal(thumbMetrics(999, 300, 600, 300).thumbLeft, 150);
});
test('arrastar converte marcador em rolagem', () => {
  assert.equal(scrollForThumbLeft(75, 150, 300, 300), 150);
  assert.equal(scrollForThumbLeft(-10, 150, 300, 300), 0);
  assert.equal(scrollForThumbLeft(500, 150, 300, 300), 300);
});
test('clique no trilho centraliza o marcador', () => {
  assert.equal(scrollForTrackClick(150, 150, 300, 300), 150);
  assert.equal(scrollForTrackClick(0, 150, 300, 300), 0);
  assert.equal(scrollForTrackClick(300, 150, 300, 300), 300);
});
test('percentual', () => {
  assert.equal(percent(150, 300), 50);
  assert.equal(percent(0, 0), 0);
});

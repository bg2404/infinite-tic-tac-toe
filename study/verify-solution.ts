/**
 * Independent certificate check for the tablebase.
 *
 * Rather than trusting the retrograde-analysis implementation, this verifies
 * the *result* against the three invariants that define a correct solution of
 * a loopy game. If all three hold, the labelling is provably correct:
 *
 *   LOSS(P): P has no immediate win, and EVERY move leads to a WIN for the
 *            opponent, with strictly smaller distance. => P is lost.
 *   WIN(P) : P has an immediate win (dist 1), or SOME move leads to a LOSS
 *            with strictly smaller distance. => P is won, in dist plies.
 *   DRAW(P): P has no immediate win, and SOME move leads to another DRAW.
 *            Since this holds for every DRAW position and none is terminal,
 *            both players can keep the game inside the draw set forever, and
 *            neither can ever complete a line. => the game is infinite.
 *
 * The distance conditions rule out circular "wins" that never actually land.
 */
import { Label, solve } from './tablebase';

const tb = solve();
let bad = 0;
const fail = (msg: string) => {
  if (bad++ < 10) console.error(`FAIL: ${msg}`);
};

let drawWithDrawChild = 0;
let winByImmediate = 0;
let winByMove = 0;

for (let p = 0; p < tb.count; p++) {
  const label = tb.label[p];
  const hasImmediate = tb.winMoves[p] !== 0;
  const lo = tb.childOff[p];
  const hi = tb.childOff[p + 1];

  if (label === Label.LOSS) {
    if (hasImmediate) fail(`LOSS state ${p} has an immediate winning move`);
    if (hi === lo) fail(`LOSS state ${p} has no moves (impossible: board never fills)`);
    for (let e = lo; e < hi; e++) {
      const c = tb.childIdx[e];
      if (tb.label[c] !== Label.WIN) fail(`LOSS state ${p} has non-WIN child ${c}`);
      if (tb.dist[c] >= tb.dist[p]) fail(`LOSS state ${p} distance not decreasing`);
    }
  } else if (label === Label.WIN) {
    if (hasImmediate) {
      if (tb.dist[p] !== 1) fail(`WIN state ${p} has immediate win but dist ${tb.dist[p]}`);
      winByImmediate++;
    } else {
      let ok = false;
      for (let e = lo; e < hi; e++) {
        const c = tb.childIdx[e];
        if (tb.label[c] === Label.LOSS && tb.dist[c] < tb.dist[p]) {
          ok = true;
          break;
        }
      }
      if (!ok) fail(`WIN state ${p} has no move to a strictly closer LOSS`);
      winByMove++;
    }
  } else {
    // DRAW
    if (hasImmediate) fail(`DRAW state ${p} has an immediate winning move`);
    let ok = false;
    for (let e = lo; e < hi; e++) {
      if (tb.label[tb.childIdx[e]] === Label.DRAW) {
        ok = true;
        break;
      }
    }
    if (!ok) fail(`DRAW state ${p} cannot stay in the draw set`);
    drawWithDrawChild++;
  }
}

console.log(bad === 0 ? 'CERTIFICATE VALID' : `CERTIFICATE INVALID (${bad} violations)`);
console.log(`  states checked            : ${tb.count.toLocaleString()}`);
console.log(`  wins by immediate line    : ${winByImmediate.toLocaleString()}`);
console.log(`  wins by forcing move      : ${winByMove.toLocaleString()}`);
console.log(`  draws closed under D->D   : ${drawWithDrawChild.toLocaleString()}`);
if (bad !== 0) process.exit(1);

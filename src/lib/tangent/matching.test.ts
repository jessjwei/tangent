import assert from "node:assert/strict";
import test from "node:test";
import { decideMatch, type Streak } from "./matching.ts";
import type { MatchSettings } from "./types.ts";

const settings: MatchSettings = {
  minConfidence: 0.22,
  hysteresis: 0.06,
  consecutiveHits: 2,
  windowSlides: 5,
  aiAssist: false,
};

const slides = [
  "tangent line derivative slope touches the curve direction",
  "secant line two points collapse together nearby points",
  "limit definition quotient approaches zero derivative",
  "power rule exponent drops by one polynomial",
  "worked example parabola tangent slope at three",
  "exam focus chain rule sine of x squared",
];

const quiet: Streak = { slide: 0, hits: 0 };

test("two agreeing checks jump forward, one does not", () => {
  const speech = "Picture a secant line cutting through two nearby points on the curve";
  const first = decideMatch({
    current: 0,
    slideCount: slides.length,
    recentText: speech,
    slides,
    settings,
    streak: quiet,
  });
  assert.equal(first.jumped, false);
  assert.equal(first.slide, 0);
  assert.equal(first.proposed, 1);

  const second = decideMatch({
    current: 0,
    slideCount: slides.length,
    recentText: `${speech}. The secant line collapses as those two points come together`,
    slides,
    settings,
    streak: first.streak,
  });
  assert.equal(second.jumped, true);
  assert.equal(second.slide, 1);
});

test("unrelated speech stays on the current slide", () => {
  const result = decideMatch({
    current: 2,
    slideCount: slides.length,
    recentText: "the weather outside is lovely this afternoon walk",
    slides,
    settings,
    streak: { slide: 2, hits: 0 },
  });
  assert.equal(result.jumped, false);
  assert.equal(result.slide, 2);
});

test("recent-first window ignores a far later slide", () => {
  const narrow: MatchSettings = { ...settings, windowSlides: 2, consecutiveHits: 1 };
  const result = decideMatch({
    current: 0,
    slideCount: slides.length,
    recentText: "exam focus chain rule sine of x squared please remember",
    slides,
    settings: narrow,
    streak: quiet,
  });
  assert.equal(result.jumped, false);
  assert.equal(result.slide, 0);
});

test("empty speech never moves", () => {
  const result = decideMatch({
    current: 3,
    slideCount: slides.length,
    recentText: "ok",
    slides,
    settings,
    streak: quiet,
  });
  assert.equal(result.accepted, false);
  assert.equal(result.slide, 3);
});

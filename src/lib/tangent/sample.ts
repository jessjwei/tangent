export type SampleStep = { slide: number; line: string };

export type SampleDeck = {
  className: string;
  lectureName: string;
  slides: { text: string; image: string }[];
  script: SampleStep[];
};

const SCRIPT: SampleStep[] = [
  { slide: 0, line: "Today we study the tangent line, and what a derivative actually measures." },
  { slide: 0, line: "A tangent touches the curve at one point and matches its direction. That slope is the derivative." },
  { slide: 1, line: "Picture a secant line cutting through two nearby points on the curve." },
  { slide: 1, line: "As those two points collapse together, the secant line becomes the tangent." },
  { slide: 2, line: "The limit definition writes the derivative as a quotient as h approaches zero." },
  { slide: 2, line: "That limit of the difference quotient is the slope of the tangent line." },
  { slide: 3, line: "The power rule says the derivative of x to the n is n times x to the n minus one." },
  { slide: 3, line: "Use the power rule on polynomials before you reach for the limit definition." },
  { slide: 4, line: "Worked example. The parabola y equals x squared, and we want the tangent at x equals three." },
  { slide: 4, line: "The slope is six, so the tangent line is y equals six x minus nine." },
  { slide: 5, line: "Exam focus: the chain rule. The derivative of sine of x squared needs the chain rule." },
  { slide: 5, line: "Differentiate the outside sine, then multiply by the derivative of the inside x squared." },
];

export function sampleScript(): SampleStep[] {
  return SCRIPT.map((step) => ({ ...step }));
}

export function buildSampleDeck(): SampleDeck {
  const groups = SCRIPT.reduce<string[][]>((acc, step) => {
    const bucket = acc[step.slide] ?? [];
    bucket.push(step.line);
    acc[step.slide] = bucket;
    return acc;
  }, []);

  const titles = [
    "The tangent line",
    "Secants collapse",
    "Limit definition",
    "Power rule",
    "A worked example",
    "Exam focus: chain rule",
  ];

  const slides = titles.map((title, index) => {
    const lines = groups[index] ?? [];
    const text = [title, ...lines].join(" ");
    return { text, image: drawSlide(index + 1, title, lines) };
  });

  return {
    className: "Calculus",
    lectureName: "The tangent line",
    slides,
    script: sampleScript(),
  };
}

function drawSlide(number: number, title: string, lines: string[]): string {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 900;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#f7f1e4";
  ctx.fillRect(0, 0, 1200, 900);
  ctx.fillStyle = "#0c3c78";
  ctx.fillRect(0, 0, 1200, 16);
  ctx.fillStyle = "#c24d32";
  ctx.fillRect(0, 16, 1200, 6);
  ctx.fillStyle = "#e7d7c4";
  for (let y = 150; y < 860; y += 52) {
    ctx.fillRect(72, y, 1056, 1);
  }
  ctx.fillStyle = "#c23b3b";
  ctx.fillRect(92, 48, 2, 820);

  ctx.fillStyle = "#0c3c78";
  ctx.font = "600 22px Georgia, serif";
  ctx.fillText(`CALCULUS  ·  SLIDE ${number}`, 128, 92);

  ctx.fillStyle = "#1c1915";
  ctx.font = "650 58px Georgia, serif";
  const titleLines = wrap(ctx, title, 940);
  titleLines.forEach((line, index) => {
    ctx.fillText(line, 128, 180 + index * 68);
  });

  ctx.font = "400 30px Georgia, serif";
  ctx.fillStyle = "#3a342c";
  let y = 180 + titleLines.length * 68 + 36;
  for (const sentence of lines) {
    const wrapped = wrap(ctx, sentence, 920);
    for (const line of wrapped) {
      ctx.fillText(line, 128, y);
      y += 46;
    }
    y += 18;
  }

  ctx.fillStyle = "#0c3c78";
  ctx.font = "600 22px Georgia, serif";
  ctx.fillText("Tangent.", 128, 850);
  return canvas.toDataURL("image/jpeg", 0.84);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width > max && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

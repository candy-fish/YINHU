// ============================================
// CHRONO - KINETIC CALENDAR SYSTEM
// p5.js VERSION - DARK THEME (300px)
// ============================================

let monthRings = [];

// ============================================
// 高速旋转控制
// ============================================

let fastRingIndex = 0;
let nextFastRingIndex = 1;

let fastProgress = 0;

let fastDuration = 1.15;

let overlapTime = 0.10;

// ============================================
// 配色 - 适配深色主题
// ============================================

let bgColor;
let textDark;
let highlightGreen;
let trackColor;
let markerColor;  // 当前月份起点标记颜色

// ============================================

const WIDGET_SIZE = 300;

// ============================================

function setup() {

  let canvas = createCanvas(WIDGET_SIZE, WIDGET_SIZE);
  canvas.parent('calendarIcon');
  const icon = document.getElementById('calendarIcon');
  icon.addEventListener('click', () => document.dispatchEvent(new CustomEvent('openCalendar')));

  smooth();

  textAlign(CENTER, CENTER);

  textFont('Arial');

  bgColor = color(10, 10, 20, 0);
  textDark = color(245, 240, 232);
  highlightGreen = color(136, 153, 255);
  trackColor = color(255, 255, 255, 25);
  markerColor = color(255, 0, 128);  

  // =========================================
  // 小尺寸参数（参考原 300px 版本）
  // =========================================

  let startR = 38;

  let gap = 7.5;

  let daysInMonth = [
    31, 28, 31, 30,
    31, 30, 31, 31,
    30, 31, 30, 31
  ];

  for (let i = 0; i < 12; i++) {

    let r = startR + i * gap;

    let fs = map(i, 0, 11, 4.5, 8);

    monthRings.push(
      new MonthRing(
        i + 1,
        r,
        daysInMonth[i],
        fs
      )
    );
  }
}

// ============================================

function draw() {

  clear();

  let d = day();
  let mo = month();

  // =========================================
  // 高速圈连续切换
  // =========================================

  fastProgress += deltaTime / 1000.0;

  let startNext =
    fastProgress >
    (fastDuration - overlapTime);

  if (fastProgress >= fastDuration) {

    fastProgress = 0;

    fastRingIndex = nextFastRingIndex;

    nextFastRingIndex++;

    if (nextFastRingIndex >= 12) {
      nextFastRingIndex = 0;
    }

    while (nextFastRingIndex === mo - 1) {

      nextFastRingIndex++;

      if (nextFastRingIndex >= 12) {
        nextFastRingIndex = 0;
      }
    }
  }

  // =========================================

  push();

  translate(width / 2, height / 2);

  // =========================================
  // 月份环
  // =========================================

  for (let i = 0; i < 12; i++) {

    let ring = monthRings[i];

    ring.currentDay = -1;

    ring.isCurrentMonth = false;

    if (i + 1 === mo) {

      ring.currentDay = d - 1;

      ring.isCurrentMonth = true;
    }

    let isFast =
      (i === fastRingIndex);

    let isNextFast =
      (i === nextFastRingIndex && startNext);

    ring.update(isFast, isNextFast);

    ring.display();
  }

  drawOuterClock();

  drawCenterClock();

  pop();
}

// ============================================
// Month Ring
// ============================================

class MonthRing {

  constructor(
    mn,
    r,
    dc,
    fs
  ) {

    this.monthNum = mn;

    this.radius = r;

    this.daysCount = dc;

    this.fontSize = fs;

    this.currentDay = -1;

    this.isCurrentMonth = false;

    this.rotation = random(TWO_PI);
  }

  // =========================================

  update(
    isFast,
    isNextFast
  ) {

    if (this.isCurrentMonth) {

      this.rotation =
        -this.currentDay *
        this.getStepAngle();

      return;
    }

    if (isFast) {

      this.rotation += 0.11;
    }

    else if (isNextFast) {

      this.rotation += 0.08;
    }

    else {

      this.rotation += 0.004;
    }
  }

  // =========================================

  display() {

    push();

    rotate(this.rotation);

    let spacing =
      this.getStepAngle();

    let startAngle =
      -HALF_PI;

    for (let i = 0; i < this.daysCount; i++) {

      let angle =
        startAngle +
        i * spacing;

      let x =
        cos(angle) * this.radius;

      let y =
        sin(angle) * this.radius;

      let isCurrent =
        (i === this.currentDay);

      push();

      translate(x, y);

      rotate(angle + HALF_PI);

      // =====================================
      // 起点标记 - 仅当前月份玫红色
      // =====================================

      if (i === 0) {

        noStroke();

        // 仅当前月份用玫红色，其他月份用深灰色
        if (this.isCurrentMonth) {
          fill(markerColor);  // 赛博朋克玫红色 rgb(255, 0, 128)
        } else {
          fill(80);  // 深灰色，不显眼
        }

        ellipse(
          -this.fontSize * 1.7,
          0,
          2,
          2
        );
      }

      // =====================================
      // 当前日期
      // =====================================

      if (isCurrent) {

        fill(highlightGreen);  // 保持蓝紫色

        textSize(this.fontSize + 1.2);
      }

      // =====================================
      // 普通数字
      // =====================================

      else {

        fill(textDark);

        textSize(this.fontSize);
      }

      text(
        nf(i + 1, 2),
        0,
        0
      );

      pop();
    }

    pop();
  }

  // =========================================
  // 外圈数字间隔增大（参考 300px 版本）
  // =========================================

  getStepAngle() {

    let arcSpacing =
      map(
        this.radius,
        38,
        120,
        7,
        13
      );

    return arcSpacing / this.radius;
  }
}

// ============================================
// 外圈时钟
// ============================================

function drawOuterClock() {

  let outerR = 136;

  let numR = 153;

  noFill();

  stroke(trackColor);

  strokeWeight(1);

  ellipse(
    0,
    0,
    outerR * 2,
    outerR * 2
  );

  // =========================================
  // 刻度
  // =========================================

  for (let i = 0; i < 60; i++) {

    let angle =
      map(
        i,
        0,
        60,
        -HALF_PI,
        TWO_PI - HALF_PI
      );

    let len =
      (i % 5 === 0) ? 10 : 4;

    let x1 =
      cos(angle) * (outerR + 2);

    let y1 =
      sin(angle) * (outerR + 2);

    let x2 =
      cos(angle) * (outerR + 2 + len);

    let y2 =
      sin(angle) * (outerR + 2 + len);

    if (i % 5 === 0) {

      stroke(136, 153, 255, 100);  // 保持蓝紫色主刻度

      strokeWeight(1.5);

    } else {

      stroke(255, 255, 255, 40);   // 白半透明次刻度

      strokeWeight(1);
    }

    line(x1, y1, x2, y2);
  }

  // =========================================
  // 小时数字 - 银白色
  // =========================================

  for (let i = 1; i <= 12; i++) {

    let angle =
      map(
        i,
        0,
        12,
        -HALF_PI,
        TWO_PI - HALF_PI
      );

    let x =
      cos(angle) * numR;

    let y =
      sin(angle) * numR;

    push();

    translate(x, y);

    fill(textDark);

    noStroke();

    textSize(8);

    text(i, 0, 0);

    pop();
  }
}

// ============================================
// 中心时钟
// ============================================

function drawCenterClock() {

  let h = hour();

  let m = minute();

  let s = second();

  // 时针

  let hAngle =
    map(
      h % 12 + m / 60.0,
      0,
      12,
      -HALF_PI,
      TWO_PI - HALF_PI
    );

  stroke(textDark);

  strokeWeight(2.5);

  line(
    0,
    0,
    cos(hAngle) * 18,
    sin(hAngle) * 18
  );

  // 分针

  let mAngle =
    map(
      m + s / 60.0,
      0,
      60,
      -HALF_PI,
      TWO_PI - HALF_PI
    );

  stroke(180);

  strokeWeight(2);

  line(
    0,
    0,
    cos(mAngle) * 28,
    sin(mAngle) * 28
  );

  // 秒针

  let sAngle =
    map(
      s,
      0,
      60,
      -HALF_PI,
      TWO_PI - HALF_PI
    );

  stroke(highlightGreen);  // 保持蓝紫色

  strokeWeight(1);

  line(
    0,
    0,
    cos(sAngle) * 36,
    sin(sAngle) * 36
  );

  line(
    0,
    0,
    cos(sAngle + PI) * 8,
    sin(sAngle + PI) * 8
  );

  // 中心点

  noStroke();

  fill(textDark);

  ellipse(0, 0, 5, 5);

  fill(255);

  ellipse(0, 0, 2, 2);
}

// ============================================
// 点击打开日历弹窗
// ============================================

// ============================================
// 鼠标悬停效果
// ============================================

function mouseMoved() {

  let d = dist(mouseX, mouseY, width / 2, height / 2);

  if (d < width / 2) {
    cursor(HAND);
  } else {
    cursor(ARROW);
  }
}

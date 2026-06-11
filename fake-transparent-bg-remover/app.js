const elements = {
  fileInput: document.getElementById("fileInput"),
  dropZone: document.getElementById("dropZone"),
  sourceCanvas: document.getElementById("sourceCanvas"),
  resultCanvas: document.getElementById("resultCanvas"),
  sourceEmpty: document.getElementById("sourceEmpty"),
  resultEmpty: document.getElementById("resultEmpty"),
  sourceMeta: document.getElementById("sourceMeta"),
  resultMeta: document.getElementById("resultMeta"),
  statusDot: document.getElementById("statusDot"),
  statusText: document.getElementById("statusText"),
  toleranceInput: document.getElementById("toleranceInput"),
  toleranceValue: document.getElementById("toleranceValue"),
  softnessInput: document.getElementById("softnessInput"),
  softnessValue: document.getElementById("softnessValue"),
  cellSizeInput: document.getElementById("cellSizeInput"),
  autoDetectBtn: document.getElementById("autoDetectBtn"),
  gridAwareInput: document.getElementById("gridAwareInput"),
  edgeCleanInput: document.getElementById("edgeCleanInput"),
  darkSwatch: document.getElementById("darkSwatch"),
  lightSwatch: document.getElementById("lightSwatch"),
  pickDarkBtn: document.getElementById("pickDarkBtn"),
  pickLightBtn: document.getElementById("pickLightBtn"),
  processBtn: document.getElementById("processBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  detectInfo: document.getElementById("detectInfo"),
};

const sourceContext = elements.sourceCanvas.getContext("2d", { willReadFrequently: true });
const resultContext = elements.resultCanvas.getContext("2d", { willReadFrequently: true });

const state = {
  sourceImageData: null,
  fileName: "transparent-image.png",
  bgDark: { r: 190, g: 190, b: 190 },
  bgLight: { r: 244, g: 244, b: 244 },
  checker: {
    size: 16,
    offsetX: 0,
    offsetY: 0,
    flip: 0,
    confidence: 0,
  },
  pickTarget: null,
  processTimer: 0,
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const luminance = (color) => color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
const distance = (r, g, b, color) => {
  const dr = r - color.r;
  const dg = g - color.g;
  const db = b - color.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

const smoothstep = (edge0, edge1, value) => {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

function setStatus(text, mode = "idle") {
  elements.statusText.textContent = text;
  elements.statusDot.classList.toggle("ready", mode === "ready");
  elements.statusDot.classList.toggle("warn", mode === "warn");
}

function updateRangeLabels() {
  elements.toleranceValue.value = elements.toleranceInput.value;
  elements.softnessValue.value = elements.softnessInput.value;
}

function toHex(color) {
  const part = (value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
  return `#${part(color.r)}${part(color.g)}${part(color.b)}`;
}

function updateSwatches() {
  elements.darkSwatch.style.backgroundColor = toHex(state.bgDark);
  elements.lightSwatch.style.backgroundColor = toHex(state.bgLight);
}

function setPicking(target) {
  state.pickTarget = state.pickTarget === target ? null : target;
  elements.pickDarkBtn.classList.toggle("active", state.pickTarget === "dark");
  elements.pickLightBtn.classList.toggle("active", state.pickTarget === "light");
  elements.sourceCanvas.parentElement.classList.toggle("picking", Boolean(state.pickTarget));

  if (state.pickTarget === "dark") setStatus("在原圖點一下深色格子", "warn");
  if (state.pickTarget === "light") setStatus("在原圖點一下淺色格子", "warn");
  if (!state.pickTarget && state.sourceImageData) setStatus("圖片已處理", "ready");
}

function scheduleProcess() {
  window.clearTimeout(state.processTimer);
  state.processTimer = window.setTimeout(processImage, 80);
}

function resizeCanvases(width, height) {
  elements.sourceCanvas.width = width;
  elements.sourceCanvas.height = height;
  elements.resultCanvas.width = width;
  elements.resultCanvas.height = height;
}

async function loadFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    setStatus("請選擇圖片檔", "warn");
    return;
  }

  setStatus("讀取圖片中...");
  const imageUrl = URL.createObjectURL(file);
  const image = new Image();

  image.onload = () => {
    URL.revokeObjectURL(imageUrl);
    state.fileName = file.name || "transparent-image.png";

    resizeCanvases(image.naturalWidth, image.naturalHeight);
    sourceContext.clearRect(0, 0, image.naturalWidth, image.naturalHeight);
    sourceContext.drawImage(image, 0, 0);

    state.sourceImageData = sourceContext.getImageData(0, 0, image.naturalWidth, image.naturalHeight);
    elements.sourceEmpty.classList.add("hidden");
    elements.resultEmpty.classList.add("hidden");
    elements.sourceMeta.textContent = `${image.naturalWidth} x ${image.naturalHeight}`;
    elements.resultMeta.textContent = "準備中";

    autoDetect();
    processImage();
  };

  image.onerror = () => {
    URL.revokeObjectURL(imageUrl);
    setStatus("圖片讀取失敗", "warn");
  };

  image.src = imageUrl;
}

function collectBorderSamples(imageData, width, height, limit = 14000) {
  const samples = [];
  const data = imageData.data;
  const band = clamp(Math.round(Math.min(width, height) * 0.06), 4, 34);
  const stride = Math.max(1, Math.floor(Math.max(width, height) / 900));

  const addPixel = (x, y) => {
    if (samples.length >= limit) return;
    const index = (y * width + x) * 4;
    const alpha = data[index + 3];
    if (alpha < 20) return;
    samples.push({
      x,
      y,
      r: data[index],
      g: data[index + 1],
      b: data[index + 2],
    });
  };

  for (let y = 0; y < height; y += stride) {
    const isEdgeY = y < band || y >= height - band;
    for (let x = 0; x < width; x += stride) {
      if (isEdgeY || x < band || x >= width - band) addPixel(x, y);
    }
  }

  if (samples.length < 40) {
    const looseStride = Math.max(1, Math.floor(Math.sqrt((width * height) / 8000)));
    for (let y = 0; y < height; y += looseStride) {
      for (let x = 0; x < width; x += looseStride) addPixel(x, y);
    }
  }

  return samples;
}

function kMeansTwoColors(samples) {
  if (!samples.length) {
    return {
      dark: { r: 190, g: 190, b: 190 },
      light: { r: 244, g: 244, b: 244 },
    };
  }

  let darkest = samples[0];
  let lightest = samples[0];

  for (const sample of samples) {
    const value = luminance(sample);
    if (value < luminance(darkest)) darkest = sample;
    if (value > luminance(lightest)) lightest = sample;
  }

  let centerA = { r: darkest.r, g: darkest.g, b: darkest.b };
  let centerB = { r: lightest.r, g: lightest.g, b: lightest.b };

  for (let iteration = 0; iteration < 9; iteration += 1) {
    const sumA = { r: 0, g: 0, b: 0, count: 0 };
    const sumB = { r: 0, g: 0, b: 0, count: 0 };

    for (const sample of samples) {
      const distA = distance(sample.r, sample.g, sample.b, centerA);
      const distB = distance(sample.r, sample.g, sample.b, centerB);
      const bucket = distA <= distB ? sumA : sumB;
      bucket.r += sample.r;
      bucket.g += sample.g;
      bucket.b += sample.b;
      bucket.count += 1;
    }

    if (sumA.count) {
      centerA = {
        r: sumA.r / sumA.count,
        g: sumA.g / sumA.count,
        b: sumA.b / sumA.count,
      };
    }

    if (sumB.count) {
      centerB = {
        r: sumB.r / sumB.count,
        g: sumB.g / sumB.count,
        b: sumB.b / sumB.count,
      };
    }
  }

  return luminance(centerA) <= luminance(centerB)
    ? { dark: centerA, light: centerB }
    : { dark: centerB, light: centerA };
}

function classifyPixel(r, g, b) {
  const darkDistance = distance(r, g, b, state.bgDark);
  const lightDistance = distance(r, g, b, state.bgLight);
  const closest = Math.min(darkDistance, lightDistance);
  const gap = Math.abs(darkDistance - lightDistance);

  if (closest > 90 || gap < 4) return null;
  return darkDistance < lightDistance ? 0 : 1;
}

function scanRuns(imageData, width, height) {
  const data = imageData.data;
  const runs = [];
  const band = clamp(Math.round(Math.min(width, height) * 0.055), 3, 26);
  const horizontalLines = [
    0,
    Math.floor(band / 2),
    Math.max(0, band - 1),
    Math.max(0, height - band),
    Math.max(0, height - 1 - Math.floor(band / 2)),
    height - 1,
  ];
  const verticalLines = [
    0,
    Math.floor(band / 2),
    Math.max(0, band - 1),
    Math.max(0, width - band),
    Math.max(0, width - 1 - Math.floor(band / 2)),
    width - 1,
  ];

  const readLabel = (x, y) => {
    const index = (y * width + x) * 4;
    if (data[index + 3] < 20) return null;
    return classifyPixel(data[index], data[index + 1], data[index + 2]);
  };

  const pushRun = (length) => {
    if (length >= 3 && length <= 260) runs.push(length);
  };

  for (const y of horizontalLines) {
    let previous = null;
    let count = 0;
    for (let x = 0; x < width; x += 1) {
      const label = readLabel(x, y);
      if (label === null) {
        pushRun(count);
        previous = null;
        count = 0;
      } else if (previous === null || label === previous) {
        previous = label;
        count += 1;
      } else {
        pushRun(count);
        previous = label;
        count = 1;
      }
    }
    pushRun(count);
  }

  for (const x of verticalLines) {
    let previous = null;
    let count = 0;
    for (let y = 0; y < height; y += 1) {
      const label = readLabel(x, y);
      if (label === null) {
        pushRun(count);
        previous = null;
        count = 0;
      } else if (previous === null || label === previous) {
        previous = label;
        count += 1;
      } else {
        pushRun(count);
        previous = label;
        count = 1;
      }
    }
    pushRun(count);
  }

  return runs;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function estimateCellSize(imageData, width, height) {
  const runs = scanRuns(imageData, width, height);
  if (runs.length < 6) return 16;

  const rough = median(runs);
  const nearby = runs.filter((value) => Math.abs(value - rough) <= Math.max(4, rough * 0.35));
  const refined = nearby.length >= 4 ? median(nearby) : rough;

  return clamp(Math.round(refined), 3, 256);
}

function collectClassifiedBorderPixels(imageData, width, height) {
  const samples = [];
  const data = imageData.data;
  const band = clamp(Math.round(Math.min(width, height) * 0.065), 4, 32);
  const stride = Math.max(1, Math.floor(Math.max(width, height) / 620));

  for (let y = 0; y < height; y += stride) {
    const isEdgeY = y < band || y >= height - band;
    for (let x = 0; x < width; x += stride) {
      if (!isEdgeY && x >= band && x < width - band) continue;
      const index = (y * width + x) * 4;
      if (data[index + 3] < 20) continue;
      const label = classifyPixel(data[index], data[index + 1], data[index + 2]);
      if (label !== null) samples.push({ x, y, label });
    }
  }

  return samples.slice(0, 7000);
}

function estimateCheckerPhase(imageData, width, height, size) {
  const samples = collectClassifiedBorderPixels(imageData, width, height);
  if (!samples.length) {
    return { size, offsetX: 0, offsetY: 0, flip: 0, confidence: 0 };
  }

  const step = size > 80 ? 4 : size > 44 ? 2 : 1;
  let best = {
    score: -1,
    offsetX: 0,
    offsetY: 0,
    flip: 0,
  };

  for (let offsetY = 0; offsetY < size; offsetY += step) {
    for (let offsetX = 0; offsetX < size; offsetX += step) {
      for (let flip = 0; flip <= 1; flip += 1) {
        let matches = 0;
        for (const sample of samples) {
          const predicted =
            (Math.floor((sample.x + offsetX) / size) +
              Math.floor((sample.y + offsetY) / size) +
              flip) &
            1;
          if (predicted === sample.label) matches += 1;
        }

        const score = matches / samples.length;
        if (score > best.score) {
          best = { score, offsetX, offsetY, flip };
        }
      }
    }
  }

  return {
    size,
    offsetX: best.offsetX,
    offsetY: best.offsetY,
    flip: best.flip,
    confidence: best.score,
  };
}

function autoDetect() {
  if (!state.sourceImageData) return;

  const { width, height } = state.sourceImageData;
  const samples = collectBorderSamples(state.sourceImageData, width, height);
  const colors = kMeansTwoColors(samples);
  state.bgDark = colors.dark;
  state.bgLight = colors.light;

  const size = estimateCellSize(state.sourceImageData, width, height);
  state.checker = estimateCheckerPhase(state.sourceImageData, width, height, size);
  elements.cellSizeInput.value = state.checker.size;

  updateSwatches();
  updateDetectInfo();
}

function updateDetectInfo() {
  const percent = Math.round((state.checker.confidence || 0) * 100);
  const size = state.checker.size || Number(elements.cellSizeInput.value) || 16;

  elements.detectInfo.textContent =
    percent > 0
      ? `目前估算：格子約 ${size}px，背景符合度 ${percent}%。`
      : `目前估算：格子約 ${size}px。`;
}

function expectedBackgroundAt(x, y) {
  const size = clamp(Number(elements.cellSizeInput.value) || state.checker.size || 16, 3, 256);
  const checker =
    (Math.floor((x + state.checker.offsetX) / size) +
      Math.floor((y + state.checker.offsetY) / size) +
      state.checker.flip) &
    1;
  return checker === 0 ? state.bgDark : state.bgLight;
}

function processImage() {
  if (!state.sourceImageData) {
    setStatus("請先選擇圖片", "warn");
    return;
  }

  updateRangeLabels();

  const { width, height, data } = state.sourceImageData;
  const output = resultContext.createImageData(width, height);
  const out = output.data;
  const tolerance = Number(elements.toleranceInput.value);
  const softness = Number(elements.softnessInput.value);
  const useGrid = elements.gridAwareInput.checked;
  const cleanEdge = elements.edgeCleanInput.checked;
  let transparentPixels = 0;
  let softenedPixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const originalAlpha = data[index + 3];

      if (originalAlpha === 0) {
        out[index] = 0;
        out[index + 1] = 0;
        out[index + 2] = 0;
        out[index + 3] = 0;
        continue;
      }

      const expected = expectedBackgroundAt(x, y);
      const alternate = expected === state.bgDark ? state.bgLight : state.bgDark;
      const expectedDistance = distance(r, g, b, expected);
      const alternateDistance = distance(r, g, b, alternate);

      let chosenBg = expected;
      let bgDistance = expectedDistance;

      if (!useGrid || (alternateDistance + tolerance * 0.25 < expectedDistance && alternateDistance < tolerance * 0.85)) {
        chosenBg = alternate;
        bgDistance = alternateDistance;
      }

      let removeAmount = 0;
      if (bgDistance <= tolerance) {
        removeAmount = 1;
      } else if (softness > 0 && bgDistance <= tolerance + softness) {
        removeAmount = 1 - smoothstep(tolerance, tolerance + softness, bgDistance);
      }

      const alphaAfterRemoval = originalAlpha * (1 - removeAmount);
      const finalAlpha = clamp(Math.round(alphaAfterRemoval), 0, 255);

      if (finalAlpha <= 2) {
        out[index] = 0;
        out[index + 1] = 0;
        out[index + 2] = 0;
        out[index + 3] = 0;
        transparentPixels += 1;
        continue;
      }

      if (removeAmount > 0) softenedPixels += 1;

      if (cleanEdge && removeAmount > 0.03) {
        const alphaNorm = finalAlpha / 255;
        out[index] = clamp(Math.round((r - (1 - alphaNorm) * chosenBg.r) / alphaNorm), 0, 255);
        out[index + 1] = clamp(Math.round((g - (1 - alphaNorm) * chosenBg.g) / alphaNorm), 0, 255);
        out[index + 2] = clamp(Math.round((b - (1 - alphaNorm) * chosenBg.b) / alphaNorm), 0, 255);
      } else {
        out[index] = r;
        out[index + 1] = g;
        out[index + 2] = b;
      }

      out[index + 3] = finalAlpha;
    }
  }

  resultContext.putImageData(output, 0, 0);
  elements.downloadBtn.disabled = false;
  elements.resultMeta.textContent = `${width} x ${height}`;

  const totalPixels = width * height;
  const percent = Math.round((transparentPixels / totalPixels) * 100);
  elements.resultCanvas.dataset.transparentPixels = String(transparentPixels);
  elements.resultCanvas.dataset.softenedPixels = String(softenedPixels);
  elements.resultCanvas.dataset.totalPixels = String(totalPixels);
  elements.resultCanvas.dataset.ready = "true";

  const detail = softenedPixels ? `，邊緣處理 ${softenedPixels.toLocaleString()} 點` : "";
  setStatus(`已轉透明 ${percent}%${detail}`, "ready");
}

function averageColorAround(canvas, clickEvent, radius = 3) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((clickEvent.clientX - rect.left) / rect.width) * canvas.width);
  const y = Math.floor(((clickEvent.clientY - rect.top) / rect.height) * canvas.height);
  const startX = clamp(x - radius, 0, canvas.width - 1);
  const startY = clamp(y - radius, 0, canvas.height - 1);
  const endX = clamp(x + radius, startX, canvas.width - 1);
  const endY = clamp(y + radius, startY, canvas.height - 1);
  const imageData = sourceContext.getImageData(
    startX,
    startY,
    endX - startX + 1,
    endY - startY + 1,
  );

  const data = imageData.data;
  const sum = { r: 0, g: 0, b: 0, count: 0 };
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 20) continue;
    sum.r += data[index];
    sum.g += data[index + 1];
    sum.b += data[index + 2];
    sum.count += 1;
  }

  if (!sum.count) return null;
  return {
    r: sum.r / sum.count,
    g: sum.g / sum.count,
    b: sum.b / sum.count,
  };
}

function pickColor(event) {
  if (!state.pickTarget || !state.sourceImageData) return;

  const color = averageColorAround(elements.sourceCanvas, event);
  if (!color) return;

  if (state.pickTarget === "dark") {
    state.bgDark = color;
  } else {
    state.bgLight = color;
  }

  if (luminance(state.bgDark) > luminance(state.bgLight)) {
    const swap = state.bgDark;
    state.bgDark = state.bgLight;
    state.bgLight = swap;
  }

  state.checker = estimateCheckerPhase(
    state.sourceImageData,
    state.sourceImageData.width,
    state.sourceImageData.height,
    clamp(Number(elements.cellSizeInput.value) || 16, 3, 256),
  );

  updateSwatches();
  updateDetectInfo();
  setPicking(null);
  processImage();
}

function downloadResult() {
  if (!state.sourceImageData) return;

  const baseName = state.fileName.replace(/\.[^.]+$/, "") || "image";
  elements.resultCanvas.toBlob((blob) => {
    if (!blob) {
      setStatus("下載失敗，請再試一次", "warn");
      return;
    }

    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `${baseName}-true-transparent.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  }, "image/png");
}

function handlePaste(event) {
  const items = [...(event.clipboardData?.items || [])];
  const imageItem = items.find((item) => item.type.startsWith("image/"));
  if (!imageItem) return;

  const file = imageItem.getAsFile();
  if (file) loadFile(file);
}

elements.fileInput.addEventListener("change", (event) => {
  loadFile(event.target.files?.[0]);
});

elements.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  elements.dropZone.classList.add("dragging");
});

elements.dropZone.addEventListener("dragleave", () => {
  elements.dropZone.classList.remove("dragging");
});

elements.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  elements.dropZone.classList.remove("dragging");
  loadFile(event.dataTransfer.files?.[0]);
});

elements.toleranceInput.addEventListener("input", () => {
  updateRangeLabels();
  scheduleProcess();
});

elements.softnessInput.addEventListener("input", () => {
  updateRangeLabels();
  scheduleProcess();
});

elements.cellSizeInput.addEventListener("input", () => {
  if (!state.sourceImageData) {
    updateDetectInfo();
    return;
  }

  state.checker = estimateCheckerPhase(
    state.sourceImageData,
    state.sourceImageData?.width || 1,
    state.sourceImageData?.height || 1,
    clamp(Number(elements.cellSizeInput.value) || 16, 3, 256),
  );
  updateDetectInfo();
  scheduleProcess();
});

elements.gridAwareInput.addEventListener("change", scheduleProcess);
elements.edgeCleanInput.addEventListener("change", scheduleProcess);
elements.processBtn.addEventListener("click", processImage);
elements.downloadBtn.addEventListener("click", downloadResult);
elements.autoDetectBtn.addEventListener("click", () => {
  autoDetect();
  processImage();
});
elements.pickDarkBtn.addEventListener("click", () => setPicking("dark"));
elements.pickLightBtn.addEventListener("click", () => setPicking("light"));
elements.sourceCanvas.addEventListener("click", pickColor);
window.addEventListener("paste", handlePaste);

updateRangeLabels();
updateSwatches();

window.fakeTransparencyTool = {
  stats() {
    if (!state.sourceImageData) {
      return { hasImage: false };
    }

    const { width, height } = state.sourceImageData;
    const pixels = resultContext.getImageData(0, 0, width, height).data;
    let transparent = 0;
    let partial = 0;
    let opaque = 0;

    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] === 0) transparent += 1;
      else if (pixels[index] === 255) opaque += 1;
      else partial += 1;
    }

    return {
      hasImage: true,
      width,
      height,
      transparent,
      partial,
      opaque,
      canDownload: !elements.downloadBtn.disabled,
      status: elements.statusText.textContent,
    };
  },
};

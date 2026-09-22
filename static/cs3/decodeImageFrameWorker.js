var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __defNormalProp = (obj2, key, value) => key in obj2 ? __defProp(obj2, key, { enumerable: true, configurable: true, writable: true, value }) : obj2[key] = value;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __publicField = (obj2, key, value) => __defNormalProp(obj2, typeof key !== "symbol" ? key + "" : key, value);

// ../../../INGENI~1/AppData/Local/Temp/opencode/cs3/node_modules/@cornerstonejs/dicom-image-loader/dist/esm/codecs/jpeg.js
var jpeg_exports = {};
__export(jpeg_exports, {
  default: () => jpeg_default
});
function buildHuffmanTable(codeLengths, values) {
  var k = 0, code = [], i, j, length = 16;
  while (length > 0 && !codeLengths[length - 1])
    length--;
  code.push({ children: [], index: 0 });
  var p = code[0], q;
  for (i = 0; i < length; i++) {
    for (j = 0; j < codeLengths[i]; j++) {
      p = code.pop();
      p.children[p.index] = values[k];
      while (p.index > 0) {
        p = code.pop();
      }
      p.index++;
      code.push(p);
      while (code.length <= i) {
        code.push(q = { children: [], index: 0 });
        p.children[p.index] = q.children;
        p = q;
      }
      k++;
    }
    if (i + 1 < length) {
      code.push(q = { children: [], index: 0 });
      p.children[p.index] = q.children;
      p = q;
    }
  }
  return code[0].children;
}
function getBlockBufferOffset(component, row, col) {
  return 64 * ((component.blocksPerLine + 1) * row + col);
}
function decodeScan(data, offset, frame, components, resetInterval, spectralStart, spectralEnd, successivePrev, successive) {
  var precision = frame.precision;
  var samplesPerLine = frame.samplesPerLine;
  var scanLines = frame.scanLines;
  var mcusPerLine = frame.mcusPerLine;
  var progressive = frame.progressive;
  var maxH = frame.maxH, maxV = frame.maxV;
  var startOffset = offset, bitsData = 0, bitsCount = 0;
  function readBit() {
    if (bitsCount > 0) {
      bitsCount--;
      return bitsData >> bitsCount & 1;
    }
    bitsData = data[offset++];
    if (bitsData == 255) {
      var nextByte = data[offset++];
      if (nextByte) {
        throw "unexpected marker: " + (bitsData << 8 | nextByte).toString(16);
      }
    }
    bitsCount = 7;
    return bitsData >>> 7;
  }
  function decodeHuffman(tree) {
    var node = tree;
    var bit;
    while ((bit = readBit()) !== null) {
      node = node[bit];
      if (typeof node === "number")
        return node;
      if (typeof node !== "object")
        throw "invalid huffman sequence";
    }
    return null;
  }
  function receive(length) {
    var n2 = 0;
    while (length > 0) {
      var bit = readBit();
      if (bit === null)
        return;
      n2 = n2 << 1 | bit;
      length--;
    }
    return n2;
  }
  function receiveAndExtend(length) {
    var n2 = receive(length);
    if (n2 >= 1 << length - 1)
      return n2;
    return n2 + (-1 << length) + 1;
  }
  function decodeBaseline(component2, offset2) {
    var t = decodeHuffman(component2.huffmanTableDC);
    var diff = t === 0 ? 0 : receiveAndExtend(t);
    component2.blockData[offset2] = component2.pred += diff;
    var k2 = 1;
    while (k2 < 64) {
      var rs = decodeHuffman(component2.huffmanTableAC);
      var s = rs & 15, r = rs >> 4;
      if (s === 0) {
        if (r < 15)
          break;
        k2 += 16;
        continue;
      }
      k2 += r;
      var z = dctZigZag[k2];
      component2.blockData[offset2 + z] = receiveAndExtend(s);
      k2++;
    }
  }
  function decodeDCFirst(component2, offset2) {
    var t = decodeHuffman(component2.huffmanTableDC);
    var diff = t === 0 ? 0 : receiveAndExtend(t) << successive;
    component2.blockData[offset2] = component2.pred += diff;
  }
  function decodeDCSuccessive(component2, offset2) {
    component2.blockData[offset2] |= readBit() << successive;
  }
  var eobrun = 0;
  function decodeACFirst(component2, offset2) {
    if (eobrun > 0) {
      eobrun--;
      return;
    }
    var k2 = spectralStart, e = spectralEnd;
    while (k2 <= e) {
      var rs = decodeHuffman(component2.huffmanTableAC);
      var s = rs & 15, r = rs >> 4;
      if (s === 0) {
        if (r < 15) {
          eobrun = receive(r) + (1 << r) - 1;
          break;
        }
        k2 += 16;
        continue;
      }
      k2 += r;
      var z = dctZigZag[k2];
      component2.blockData[offset2 + z] = receiveAndExtend(s) * (1 << successive);
      k2++;
    }
  }
  var successiveACState = 0, successiveACNextValue;
  function decodeACSuccessive(component2, offset2) {
    var k2 = spectralStart, e = spectralEnd, r = 0;
    while (k2 <= e) {
      var z = dctZigZag[k2];
      switch (successiveACState) {
        case 0:
          var rs = decodeHuffman(component2.huffmanTableAC);
          var s = rs & 15;
          r = rs >> 4;
          if (s === 0) {
            if (r < 15) {
              eobrun = receive(r) + (1 << r);
              successiveACState = 4;
            } else {
              r = 16;
              successiveACState = 1;
            }
          } else {
            if (s !== 1)
              throw "invalid ACn encoding";
            successiveACNextValue = receiveAndExtend(s);
            successiveACState = r ? 2 : 3;
          }
          continue;
        case 1:
        case 2:
          if (component2.blockData[offset2 + z]) {
            component2.blockData[offset2 + z] += readBit() << successive;
          } else {
            r--;
            if (r === 0)
              successiveACState = successiveACState == 2 ? 3 : 0;
          }
          break;
        case 3:
          if (component2.blockData[offset2 + z]) {
            component2.blockData[offset2 + z] += readBit() << successive;
          } else {
            component2.blockData[offset2 + z] = successiveACNextValue << successive;
            successiveACState = 0;
          }
          break;
        case 4:
          if (component2.blockData[offset2 + z]) {
            component2.blockData[offset2 + z] += readBit() << successive;
          }
          break;
      }
      k2++;
    }
    if (successiveACState === 4) {
      eobrun--;
      if (eobrun === 0)
        successiveACState = 0;
    }
  }
  function decodeMcu(component2, decode, mcu2, row, col) {
    var mcuRow = mcu2 / mcusPerLine | 0;
    var mcuCol = mcu2 % mcusPerLine;
    var blockRow = mcuRow * component2.v + row;
    var blockCol = mcuCol * component2.h + col;
    var offset2 = getBlockBufferOffset(component2, blockRow, blockCol);
    decode(component2, offset2);
  }
  function decodeBlock(component2, decode, mcu2) {
    var blockRow = mcu2 / component2.blocksPerLine | 0;
    var blockCol = mcu2 % component2.blocksPerLine;
    var offset2 = getBlockBufferOffset(component2, blockRow, blockCol);
    decode(component2, offset2);
  }
  var componentsLength = components.length;
  var component, i, j, k, n;
  var decodeFn;
  if (progressive) {
    if (spectralStart === 0)
      decodeFn = successivePrev === 0 ? decodeDCFirst : decodeDCSuccessive;
    else
      decodeFn = successivePrev === 0 ? decodeACFirst : decodeACSuccessive;
  } else {
    decodeFn = decodeBaseline;
  }
  var mcu = 0, marker;
  var mcuExpected;
  if (componentsLength == 1) {
    mcuExpected = components[0].blocksPerLine * components[0].blocksPerColumn;
  } else {
    mcuExpected = mcusPerLine * frame.mcusPerColumn;
  }
  if (!resetInterval) {
    resetInterval = mcuExpected;
  }
  var h, v;
  while (mcu < mcuExpected) {
    for (i = 0; i < componentsLength; i++) {
      components[i].pred = 0;
    }
    eobrun = 0;
    if (componentsLength == 1) {
      component = components[0];
      for (n = 0; n < resetInterval; n++) {
        decodeBlock(component, decodeFn, mcu);
        mcu++;
      }
    } else {
      for (n = 0; n < resetInterval; n++) {
        for (i = 0; i < componentsLength; i++) {
          component = components[i];
          h = component.h;
          v = component.v;
          for (j = 0; j < v; j++) {
            for (k = 0; k < h; k++) {
              decodeMcu(component, decodeFn, mcu, j, k);
            }
          }
        }
        mcu++;
      }
    }
    bitsCount = 0;
    marker = data[offset] << 8 | data[offset + 1];
    if (marker <= 65280) {
      throw "marker was not found";
    }
    if (marker >= 65488 && marker <= 65495) {
      offset += 2;
    } else {
      break;
    }
  }
  return offset - startOffset;
}
function quantizeAndInverse(component, blockBufferOffset, p) {
  var qt = component.quantizationTable;
  var v0, v1, v2, v3, v4, v5, v6, v7, t;
  var i;
  for (i = 0; i < 64; i++) {
    p[i] = component.blockData[blockBufferOffset + i] * qt[i];
  }
  for (i = 0; i < 8; ++i) {
    var row = 8 * i;
    if (p[1 + row] === 0 && p[2 + row] === 0 && p[3 + row] === 0 && p[4 + row] === 0 && p[5 + row] === 0 && p[6 + row] === 0 && p[7 + row] === 0) {
      t = dctSqrt2 * p[0 + row] + 512 >> 10;
      p[0 + row] = t;
      p[1 + row] = t;
      p[2 + row] = t;
      p[3 + row] = t;
      p[4 + row] = t;
      p[5 + row] = t;
      p[6 + row] = t;
      p[7 + row] = t;
      continue;
    }
    v0 = dctSqrt2 * p[0 + row] + 128 >> 8;
    v1 = dctSqrt2 * p[4 + row] + 128 >> 8;
    v2 = p[2 + row];
    v3 = p[6 + row];
    v4 = dctSqrt1d2 * (p[1 + row] - p[7 + row]) + 128 >> 8;
    v7 = dctSqrt1d2 * (p[1 + row] + p[7 + row]) + 128 >> 8;
    v5 = p[3 + row] << 4;
    v6 = p[5 + row] << 4;
    t = v0 - v1 + 1 >> 1;
    v0 = v0 + v1 + 1 >> 1;
    v1 = t;
    t = v2 * dctSin6 + v3 * dctCos6 + 128 >> 8;
    v2 = v2 * dctCos6 - v3 * dctSin6 + 128 >> 8;
    v3 = t;
    t = v4 - v6 + 1 >> 1;
    v4 = v4 + v6 + 1 >> 1;
    v6 = t;
    t = v7 + v5 + 1 >> 1;
    v5 = v7 - v5 + 1 >> 1;
    v7 = t;
    t = v0 - v3 + 1 >> 1;
    v0 = v0 + v3 + 1 >> 1;
    v3 = t;
    t = v1 - v2 + 1 >> 1;
    v1 = v1 + v2 + 1 >> 1;
    v2 = t;
    t = v4 * dctSin3 + v7 * dctCos3 + 2048 >> 12;
    v4 = v4 * dctCos3 - v7 * dctSin3 + 2048 >> 12;
    v7 = t;
    t = v5 * dctSin1 + v6 * dctCos1 + 2048 >> 12;
    v5 = v5 * dctCos1 - v6 * dctSin1 + 2048 >> 12;
    v6 = t;
    p[0 + row] = v0 + v7;
    p[7 + row] = v0 - v7;
    p[1 + row] = v1 + v6;
    p[6 + row] = v1 - v6;
    p[2 + row] = v2 + v5;
    p[5 + row] = v2 - v5;
    p[3 + row] = v3 + v4;
    p[4 + row] = v3 - v4;
  }
  for (i = 0; i < 8; ++i) {
    var col = i;
    if (p[1 * 8 + col] === 0 && p[2 * 8 + col] === 0 && p[3 * 8 + col] === 0 && p[4 * 8 + col] === 0 && p[5 * 8 + col] === 0 && p[6 * 8 + col] === 0 && p[7 * 8 + col] === 0) {
      t = dctSqrt2 * p[i + 0] + 8192 >> 14;
      p[0 * 8 + col] = t;
      p[1 * 8 + col] = t;
      p[2 * 8 + col] = t;
      p[3 * 8 + col] = t;
      p[4 * 8 + col] = t;
      p[5 * 8 + col] = t;
      p[6 * 8 + col] = t;
      p[7 * 8 + col] = t;
      continue;
    }
    v0 = dctSqrt2 * p[0 * 8 + col] + 2048 >> 12;
    v1 = dctSqrt2 * p[4 * 8 + col] + 2048 >> 12;
    v2 = p[2 * 8 + col];
    v3 = p[6 * 8 + col];
    v4 = dctSqrt1d2 * (p[1 * 8 + col] - p[7 * 8 + col]) + 2048 >> 12;
    v7 = dctSqrt1d2 * (p[1 * 8 + col] + p[7 * 8 + col]) + 2048 >> 12;
    v5 = p[3 * 8 + col];
    v6 = p[5 * 8 + col];
    t = v0 - v1 + 1 >> 1;
    v0 = v0 + v1 + 1 >> 1;
    v1 = t;
    t = v2 * dctSin6 + v3 * dctCos6 + 2048 >> 12;
    v2 = v2 * dctCos6 - v3 * dctSin6 + 2048 >> 12;
    v3 = t;
    t = v4 - v6 + 1 >> 1;
    v4 = v4 + v6 + 1 >> 1;
    v6 = t;
    t = v7 + v5 + 1 >> 1;
    v5 = v7 - v5 + 1 >> 1;
    v7 = t;
    t = v0 - v3 + 1 >> 1;
    v0 = v0 + v3 + 1 >> 1;
    v3 = t;
    t = v1 - v2 + 1 >> 1;
    v1 = v1 + v2 + 1 >> 1;
    v2 = t;
    t = v4 * dctSin3 + v7 * dctCos3 + 2048 >> 12;
    v4 = v4 * dctCos3 - v7 * dctSin3 + 2048 >> 12;
    v7 = t;
    t = v5 * dctSin1 + v6 * dctCos1 + 2048 >> 12;
    v5 = v5 * dctCos1 - v6 * dctSin1 + 2048 >> 12;
    v6 = t;
    p[0 * 8 + col] = v0 + v7;
    p[7 * 8 + col] = v0 - v7;
    p[1 * 8 + col] = v1 + v6;
    p[6 * 8 + col] = v1 - v6;
    p[2 * 8 + col] = v2 + v5;
    p[5 * 8 + col] = v2 - v5;
    p[3 * 8 + col] = v3 + v4;
    p[4 * 8 + col] = v3 - v4;
  }
  for (i = 0; i < 64; ++i) {
    var index = blockBufferOffset + i;
    var q = p[i];
    q = q <= -2056 / component.bitConversion ? 0 : q >= 2024 / component.bitConversion ? 255 / component.bitConversion : q + 2056 / component.bitConversion >> 4;
    component.blockData[index] = q;
  }
}
function buildComponentData(frame, component) {
  var lines = [];
  var blocksPerLine = component.blocksPerLine;
  var blocksPerColumn = component.blocksPerColumn;
  var samplesPerLine = blocksPerLine << 3;
  var computationBuffer = new Int32Array(64);
  var i, j, ll = 0;
  for (var blockRow = 0; blockRow < blocksPerColumn; blockRow++) {
    for (var blockCol = 0; blockCol < blocksPerLine; blockCol++) {
      var offset = getBlockBufferOffset(component, blockRow, blockCol);
      quantizeAndInverse(component, offset, computationBuffer);
    }
  }
  return component.blockData;
}
function clampToUint8(a) {
  return a <= 0 ? 0 : a >= 255 ? 255 : a | 0;
}
var ColorSpace, dctZigZag, dctCos1, dctSin1, dctCos3, dctSin3, dctCos6, dctSin6, dctSqrt2, dctSqrt1d2, JpegImage, jpeg_default;
var init_jpeg = __esm({
  "../../../INGENI~1/AppData/Local/Temp/opencode/cs3/node_modules/@cornerstonejs/dicom-image-loader/dist/esm/codecs/jpeg.js"() {
    ColorSpace = { Unkown: 0, Grayscale: 1, AdobeRGB: 2, RGB: 3, CYMK: 4 };
    dctZigZag = new Int32Array([
      0,
      1,
      8,
      16,
      9,
      2,
      3,
      10,
      17,
      24,
      32,
      25,
      18,
      11,
      4,
      5,
      12,
      19,
      26,
      33,
      40,
      48,
      41,
      34,
      27,
      20,
      13,
      6,
      7,
      14,
      21,
      28,
      35,
      42,
      49,
      56,
      57,
      50,
      43,
      36,
      29,
      22,
      15,
      23,
      30,
      37,
      44,
      51,
      58,
      59,
      52,
      45,
      38,
      31,
      39,
      46,
      53,
      60,
      61,
      54,
      47,
      55,
      62,
      63
    ]);
    dctCos1 = 4017;
    dctSin1 = 799;
    dctCos3 = 3406;
    dctSin3 = 2276;
    dctCos6 = 1567;
    dctSin6 = 3784;
    dctSqrt2 = 5793;
    dctSqrt1d2 = 2896;
    JpegImage = class {
      constructor() {
      }
      load(path) {
        var handleData = function(data2) {
          this.parse(data2);
          if (this.onload)
            this.onload();
        }.bind(this);
        if (path.indexOf("data:") > -1) {
          var offset = path.indexOf("base64,") + 7;
          var data = atob(path.substring(offset));
          var arr = new Uint8Array(data.length);
          for (var i = data.length - 1; i >= 0; i--) {
            arr[i] = data.charCodeAt(i);
          }
          handleData(data);
        } else {
          var xhr = new XMLHttpRequest();
          xhr.open("GET", path, true);
          xhr.responseType = "arraybuffer";
          xhr.onload = function() {
            var data2 = new Uint8Array(xhr.response);
            handleData(data2);
          }.bind(this);
          xhr.send(null);
        }
      }
      parse(data) {
        function readUint16() {
          var value = data[offset] << 8 | data[offset + 1];
          offset += 2;
          return value;
        }
        function readDataBlock() {
          var length2 = readUint16();
          var array = data.subarray(offset, offset + length2 - 2);
          offset += array.length;
          return array;
        }
        function prepareComponents(frame2) {
          var mcusPerLine = Math.ceil(frame2.samplesPerLine / 8 / frame2.maxH);
          var mcusPerColumn = Math.ceil(frame2.scanLines / 8 / frame2.maxV);
          for (var i2 = 0; i2 < frame2.components.length; i2++) {
            component = frame2.components[i2];
            var blocksPerLine = Math.ceil(Math.ceil(frame2.samplesPerLine / 8) * component.h / frame2.maxH);
            var blocksPerColumn = Math.ceil(Math.ceil(frame2.scanLines / 8) * component.v / frame2.maxV);
            var blocksPerLineForMcu = mcusPerLine * component.h;
            var blocksPerColumnForMcu = mcusPerColumn * component.v;
            var blocksBufferSize = 64 * blocksPerColumnForMcu * (blocksPerLineForMcu + 1);
            component.blockData = new Int16Array(blocksBufferSize);
            component.blocksPerLine = blocksPerLine;
            component.blocksPerColumn = blocksPerColumn;
          }
          frame2.mcusPerLine = mcusPerLine;
          frame2.mcusPerColumn = mcusPerColumn;
        }
        var offset = 0, length = data.length;
        var jfif = null;
        var adobe = null;
        var pixels = null;
        var frame, resetInterval;
        var quantizationTables = [];
        var huffmanTablesAC = [], huffmanTablesDC = [];
        var fileMarker = readUint16();
        if (fileMarker != 65496) {
          throw "SOI not found";
        }
        fileMarker = readUint16();
        while (fileMarker != 65497) {
          var i, j, l;
          switch (fileMarker) {
            case 65504:
            case 65505:
            case 65506:
            case 65507:
            case 65508:
            case 65509:
            case 65510:
            case 65511:
            case 65512:
            case 65513:
            case 65514:
            case 65515:
            case 65516:
            case 65517:
            case 65518:
            case 65519:
            case 65534:
              var appData = readDataBlock();
              if (fileMarker === 65504) {
                if (appData[0] === 74 && appData[1] === 70 && appData[2] === 73 && appData[3] === 70 && appData[4] === 0) {
                  jfif = {
                    version: { major: appData[5], minor: appData[6] },
                    densityUnits: appData[7],
                    xDensity: appData[8] << 8 | appData[9],
                    yDensity: appData[10] << 8 | appData[11],
                    thumbWidth: appData[12],
                    thumbHeight: appData[13],
                    thumbData: appData.subarray(14, 14 + 3 * appData[12] * appData[13])
                  };
                }
              }
              if (fileMarker === 65518) {
                if (appData[0] === 65 && appData[1] === 100 && appData[2] === 111 && appData[3] === 98 && appData[4] === 101 && appData[5] === 0) {
                  adobe = {
                    version: appData[6],
                    flags0: appData[7] << 8 | appData[8],
                    flags1: appData[9] << 8 | appData[10],
                    transformCode: appData[11]
                  };
                }
              }
              break;
            case 65499:
              var quantizationTablesLength = readUint16();
              var quantizationTablesEnd = quantizationTablesLength + offset - 2;
              while (offset < quantizationTablesEnd) {
                var quantizationTableSpec = data[offset++];
                var tableData = new Int32Array(64);
                if (quantizationTableSpec >> 4 === 0) {
                  for (j = 0; j < 64; j++) {
                    var z = dctZigZag[j];
                    tableData[z] = data[offset++];
                  }
                } else if (quantizationTableSpec >> 4 === 1) {
                  for (j = 0; j < 64; j++) {
                    var zz = dctZigZag[j];
                    tableData[zz] = readUint16();
                  }
                } else
                  throw "DQT: invalid table spec";
                quantizationTables[quantizationTableSpec & 15] = tableData;
              }
              break;
            case 65472:
            case 65473:
            case 65474:
              if (frame) {
                throw "Only single frame JPEGs supported";
              }
              readUint16();
              frame = {};
              frame.extended = fileMarker === 65473;
              frame.progressive = fileMarker === 65474;
              frame.precision = data[offset++];
              frame.scanLines = readUint16();
              frame.samplesPerLine = readUint16();
              frame.components = [];
              frame.componentIds = {};
              var componentsCount = data[offset++], componentId;
              var maxH = 0, maxV = 0;
              for (i = 0; i < componentsCount; i++) {
                componentId = data[offset];
                var h = data[offset + 1] >> 4;
                var v = data[offset + 1] & 15;
                if (maxH < h)
                  maxH = h;
                if (maxV < v)
                  maxV = v;
                var qId = data[offset + 2];
                l = frame.components.push({
                  h,
                  v,
                  quantizationTable: quantizationTables[qId],
                  quantizationTableId: qId,
                  bitConversion: 255 / ((1 << frame.precision) - 1)
                });
                frame.componentIds[componentId] = l - 1;
                offset += 3;
              }
              frame.maxH = maxH;
              frame.maxV = maxV;
              prepareComponents(frame);
              break;
            case 65476:
              var huffmanLength = readUint16();
              for (i = 2; i < huffmanLength; ) {
                var huffmanTableSpec = data[offset++];
                var codeLengths = new Uint8Array(16);
                var codeLengthSum = 0;
                for (j = 0; j < 16; j++, offset++)
                  codeLengthSum += codeLengths[j] = data[offset];
                var huffmanValues = new Uint8Array(codeLengthSum);
                for (j = 0; j < codeLengthSum; j++, offset++)
                  huffmanValues[j] = data[offset];
                i += 17 + codeLengthSum;
                (huffmanTableSpec >> 4 === 0 ? huffmanTablesDC : huffmanTablesAC)[huffmanTableSpec & 15] = buildHuffmanTable(codeLengths, huffmanValues);
              }
              break;
            case 65501:
              readUint16();
              resetInterval = readUint16();
              break;
            case 65498:
              var scanLength = readUint16();
              var selectorsCount = data[offset++];
              var components = [], component;
              for (i = 0; i < selectorsCount; i++) {
                var componentIndex = frame.componentIds[data[offset++]];
                component = frame.components[componentIndex];
                var tableSpec = data[offset++];
                component.huffmanTableDC = huffmanTablesDC[tableSpec >> 4];
                component.huffmanTableAC = huffmanTablesAC[tableSpec & 15];
                components.push(component);
              }
              var spectralStart = data[offset++];
              var spectralEnd = data[offset++];
              var successiveApproximation = data[offset++];
              var processed = decodeScan(data, offset, frame, components, resetInterval, spectralStart, spectralEnd, successiveApproximation >> 4, successiveApproximation & 15);
              offset += processed;
              break;
            case 65535:
              if (data[offset] !== 255) {
                offset--;
              }
              break;
            default:
              if (data[offset - 3] == 255 && data[offset - 2] >= 192 && data[offset - 2] <= 254) {
                offset -= 3;
                break;
              }
              throw "unknown JPEG marker " + fileMarker.toString(16);
          }
          fileMarker = readUint16();
        }
        this.width = frame.samplesPerLine;
        this.height = frame.scanLines;
        this.jfif = jfif;
        this.adobe = adobe;
        this.components = [];
        switch (frame.components.length) {
          case 1:
            this.colorspace = ColorSpace.Grayscale;
            break;
          case 3:
            if (this.adobe)
              this.colorspace = ColorSpace.AdobeRGB;
            else
              this.colorspace = ColorSpace.RGB;
            break;
          case 4:
            this.colorspace = ColorSpace.CYMK;
            break;
          default:
            this.colorspace = ColorSpace.Unknown;
        }
        for (var i = 0; i < frame.components.length; i++) {
          var component = frame.components[i];
          if (!component.quantizationTable && component.quantizationTableId !== null)
            component.quantizationTable = quantizationTables[component.quantizationTableId];
          this.components.push({
            output: buildComponentData(frame, component),
            scaleX: component.h / frame.maxH,
            scaleY: component.v / frame.maxV,
            blocksPerLine: component.blocksPerLine,
            blocksPerColumn: component.blocksPerColumn,
            bitConversion: component.bitConversion
          });
        }
      }
      getData16(width, height) {
        if (this.components.length !== 1)
          throw "Unsupported color mode";
        var scaleX = this.width / width, scaleY = this.height / height;
        var component, componentScaleX, componentScaleY;
        var x, y, i;
        var offset = 0;
        var numComponents = this.components.length;
        var dataLength = width * height * numComponents;
        var data = new Uint16Array(dataLength);
        var componentLine;
        var lineData = new Uint16Array((this.components[0].blocksPerLine << 3) * this.components[0].blocksPerColumn * 8);
        for (i = 0; i < numComponents; i++) {
          component = this.components[i];
          var blocksPerLine = component.blocksPerLine;
          var blocksPerColumn = component.blocksPerColumn;
          var samplesPerLine = blocksPerLine << 3;
          var j, k, ll = 0;
          var lineOffset = 0;
          for (var blockRow = 0; blockRow < blocksPerColumn; blockRow++) {
            var scanLine = blockRow << 3;
            for (var blockCol = 0; blockCol < blocksPerLine; blockCol++) {
              var bufferOffset = getBlockBufferOffset(component, blockRow, blockCol);
              var offset = 0, sample = blockCol << 3;
              for (j = 0; j < 8; j++) {
                var lineOffset = (scanLine + j) * samplesPerLine;
                for (k = 0; k < 8; k++) {
                  lineData[lineOffset + sample + k] = component.output[bufferOffset + offset++];
                }
              }
            }
          }
          componentScaleX = component.scaleX * scaleX;
          componentScaleY = component.scaleY * scaleY;
          offset = i;
          var cx, cy;
          var index;
          for (y = 0; y < height; y++) {
            for (x = 0; x < width; x++) {
              cy = 0 | y * componentScaleY;
              cx = 0 | x * componentScaleX;
              index = cy * samplesPerLine + cx;
              data[offset] = lineData[index];
              offset += numComponents;
            }
          }
        }
        return data;
      }
      getData(width, height) {
        var scaleX = this.width / width, scaleY = this.height / height;
        var component, componentScaleX, componentScaleY;
        var x, y, i;
        var offset = 0;
        var Y, Cb, Cr, K, C, M, Ye, R, G, B;
        var colorTransform;
        var numComponents = this.components.length;
        var dataLength = width * height * numComponents;
        var data = new Uint8Array(dataLength);
        var componentLine;
        var lineData = new Uint8Array((this.components[0].blocksPerLine << 3) * this.components[0].blocksPerColumn * 8);
        for (i = 0; i < numComponents; i++) {
          component = this.components[i];
          var blocksPerLine = component.blocksPerLine;
          var blocksPerColumn = component.blocksPerColumn;
          var samplesPerLine = blocksPerLine << 3;
          var j, k, ll = 0;
          var lineOffset = 0;
          for (var blockRow = 0; blockRow < blocksPerColumn; blockRow++) {
            var scanLine = blockRow << 3;
            for (var blockCol = 0; blockCol < blocksPerLine; blockCol++) {
              var bufferOffset = getBlockBufferOffset(component, blockRow, blockCol);
              var offset = 0, sample = blockCol << 3;
              for (j = 0; j < 8; j++) {
                var lineOffset = (scanLine + j) * samplesPerLine;
                for (k = 0; k < 8; k++) {
                  lineData[lineOffset + sample + k] = component.output[bufferOffset + offset++] * component.bitConversion;
                }
              }
            }
          }
          componentScaleX = component.scaleX * scaleX;
          componentScaleY = component.scaleY * scaleY;
          offset = i;
          var cx, cy;
          var index;
          for (y = 0; y < height; y++) {
            for (x = 0; x < width; x++) {
              cy = 0 | y * componentScaleY;
              cx = 0 | x * componentScaleX;
              index = cy * samplesPerLine + cx;
              data[offset] = lineData[index];
              offset += numComponents;
            }
          }
        }
        switch (numComponents) {
          case 1:
          case 2:
            break;
          case 3:
            colorTransform = true;
            if (this.adobe && this.adobe.transformCode)
              colorTransform = true;
            else if (typeof this.colorTransform !== "undefined")
              colorTransform = !!this.colorTransform;
            if (colorTransform) {
              for (i = 0; i < dataLength; i += numComponents) {
                Y = data[i];
                Cb = data[i + 1];
                Cr = data[i + 2];
                R = clampToUint8(Y - 179.456 + 1.402 * Cr);
                G = clampToUint8(Y + 135.459 - 0.344 * Cb - 0.714 * Cr);
                B = clampToUint8(Y - 226.816 + 1.772 * Cb);
                data[i] = R;
                data[i + 1] = G;
                data[i + 2] = B;
              }
            }
            break;
          case 4:
            if (!this.adobe)
              throw "Unsupported color mode (4 components)";
            colorTransform = false;
            if (this.adobe && this.adobe.transformCode)
              colorTransform = true;
            else if (typeof this.colorTransform !== "undefined")
              colorTransform = !!this.colorTransform;
            if (colorTransform) {
              for (i = 0; i < dataLength; i += numComponents) {
                Y = data[i];
                Cb = data[i + 1];
                Cr = data[i + 2];
                C = clampToUint8(434.456 - Y - 1.402 * Cr);
                M = clampToUint8(119.541 - Y + 0.344 * Cb + 0.714 * Cr);
                Y = clampToUint8(481.816 - Y - 1.772 * Cb);
                data[i] = C;
                data[i + 1] = M;
                data[i + 2] = Y;
              }
            }
            break;
          default:
            throw "Unsupported color mode";
        }
        return data;
      }
    };
    jpeg_default = JpegImage;
  }
});

// ../../../INGENI~1/AppData/Local/Temp/opencode/cs3/node_modules/jpeg-lossless-decoder-js/release/lossless.js
var lossless_exports = {};
__export(lossless_exports, {
  ComponentSpec: () => ComponentSpec,
  DataStream: () => DataStream,
  Decoder: () => Decoder,
  FrameHeader: () => FrameHeader,
  HuffmanTable: () => HuffmanTable,
  QuantizationTable: () => QuantizationTable,
  ScanComponent: () => ScanComponent,
  ScanHeader: () => ScanHeader,
  Utils: () => utils_exports
});
var __defProp2, __export2, ComponentSpec, DataStream, FrameHeader, utils_exports, createArray, makeCRCTable, crcTable, crc32, _a, HuffmanTable, _a2, QuantizationTable, ScanComponent, ScanHeader, littleEndian, _a3, Decoder;
var init_lossless = __esm({
  "../../../INGENI~1/AppData/Local/Temp/opencode/cs3/node_modules/jpeg-lossless-decoder-js/release/lossless.js"() {
    __defProp2 = Object.defineProperty;
    __export2 = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    ComponentSpec = {
      hSamp: 0,
      quantTableSel: 0,
      vSamp: 0
    };
    DataStream = class {
      constructor(data, offset, length) {
        __publicField(this, "buffer");
        __publicField(this, "index");
        this.buffer = new Uint8Array(data, offset, length);
        this.index = 0;
      }
      get16() {
        const value = (this.buffer[this.index] << 8) + this.buffer[this.index + 1];
        this.index += 2;
        return value;
      }
      get8() {
        const value = this.buffer[this.index];
        this.index += 1;
        return value;
      }
    };
    FrameHeader = class {
      constructor() {
        __publicField(this, "dimX", 0);
        __publicField(this, "dimY", 0);
        __publicField(this, "numComp", 0);
        __publicField(this, "precision", 0);
        __publicField(this, "components", []);
      }
      read(data) {
        let count = 0;
        let temp;
        const length = data.get16();
        count += 2;
        this.precision = data.get8();
        count += 1;
        this.dimY = data.get16();
        count += 2;
        this.dimX = data.get16();
        count += 2;
        this.numComp = data.get8();
        count += 1;
        for (let i = 1; i <= this.numComp; i += 1) {
          if (count > length) {
            throw new Error("ERROR: frame format error");
          }
          const c = data.get8();
          count += 1;
          if (count >= length) {
            throw new Error("ERROR: frame format error [c>=Lf]");
          }
          temp = data.get8();
          count += 1;
          if (!this.components[c]) {
            this.components[c] = { ...ComponentSpec };
          }
          this.components[c].hSamp = temp >> 4;
          this.components[c].vSamp = temp & 15;
          this.components[c].quantTableSel = data.get8();
          count += 1;
        }
        if (count !== length) {
          throw new Error("ERROR: frame format error [Lf!=count]");
        }
        return 1;
      }
    };
    utils_exports = {};
    __export2(utils_exports, {
      crc32: () => crc32,
      crcTable: () => crcTable,
      createArray: () => createArray,
      makeCRCTable: () => makeCRCTable
    });
    createArray = (...dimensions) => {
      if (dimensions.length > 1) {
        const dim = dimensions[0];
        const rest = dimensions.slice(1);
        const newArray = [];
        for (let i = 0; i < dim; i++) {
          newArray[i] = createArray(...rest);
        }
        return newArray;
      } else {
        return Array(dimensions[0]).fill(void 0);
      }
    };
    makeCRCTable = function() {
      let c;
      const crcTable2 = [];
      for (let n = 0; n < 256; n++) {
        c = n;
        for (let k = 0; k < 8; k++) {
          c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
        }
        crcTable2[n] = c;
      }
      return crcTable2;
    };
    crcTable = makeCRCTable();
    crc32 = function(buffer) {
      const uint8view = new Uint8Array(buffer);
      let crc = 0 ^ -1;
      for (let i = 0; i < uint8view.length; i++) {
        crc = crc >>> 8 ^ crcTable[(crc ^ uint8view[i]) & 255];
      }
      return (crc ^ -1) >>> 0;
    };
    HuffmanTable = (_a = class {
      constructor() {
        __publicField(this, "l");
        __publicField(this, "th");
        __publicField(this, "v");
        __publicField(this, "tc");
        this.l = createArray(4, 2, 16);
        this.th = [0, 0, 0, 0];
        this.v = createArray(4, 2, 16, 200);
        this.tc = [
          [0, 0],
          [0, 0],
          [0, 0],
          [0, 0]
        ];
      }
      read(data, HuffTab) {
        let count = 0;
        let temp;
        let t;
        let c;
        let i;
        let j;
        const length = data.get16();
        count += 2;
        while (count < length) {
          temp = data.get8();
          count += 1;
          t = temp & 15;
          if (t > 3) {
            throw new Error("ERROR: Huffman table ID > 3");
          }
          c = temp >> 4;
          if (c > 2) {
            throw new Error("ERROR: Huffman table [Table class > 2 ]");
          }
          this.th[t] = 1;
          this.tc[t][c] = 1;
          for (i = 0; i < 16; i += 1) {
            this.l[t][c][i] = data.get8();
            count += 1;
          }
          for (i = 0; i < 16; i += 1) {
            for (j = 0; j < this.l[t][c][i]; j += 1) {
              if (count > length) {
                throw new Error("ERROR: Huffman table format error [count>Lh]");
              }
              this.v[t][c][i][j] = data.get8();
              count += 1;
            }
          }
        }
        if (count !== length) {
          throw new Error("ERROR: Huffman table format error [count!=Lf]");
        }
        for (i = 0; i < 4; i += 1) {
          for (j = 0; j < 2; j += 1) {
            if (this.tc[i][j] !== 0) {
              this.buildHuffTable(HuffTab[i][j], this.l[i][j], this.v[i][j]);
            }
          }
        }
        return 1;
      }
      //	Build_HuffTab()
      //	Parameter:  t       table ID
      //	            c       table class ( 0 for DC, 1 for AC )
      //	            L[i]    # of codewords which length is i
      //	            V[i][j] Huffman Value (length=i)
      //	Effect:
      //	    build up HuffTab[t][c] using L and V.
      buildHuffTable(tab, L, V) {
        let currentTable, k, i, j, n;
        const temp = 256;
        k = 0;
        for (i = 0; i < 8; i += 1) {
          for (j = 0; j < L[i]; j += 1) {
            for (n = 0; n < temp >> i + 1; n += 1) {
              tab[k] = V[i][j] | i + 1 << 8;
              k += 1;
            }
          }
        }
        for (i = 1; k < 256; i += 1, k += 1) {
          tab[k] = i | _a.MSB;
        }
        currentTable = 1;
        k = 0;
        for (i = 8; i < 16; i += 1) {
          for (j = 0; j < L[i]; j += 1) {
            for (n = 0; n < temp >> i - 7; n += 1) {
              tab[currentTable * 256 + k] = V[i][j] | i + 1 << 8;
              k += 1;
            }
            if (k >= 256) {
              if (k > 256) {
                throw new Error("ERROR: Huffman table error(1)!");
              }
              k = 0;
              currentTable += 1;
            }
          }
        }
      }
    }, __publicField(_a, "MSB", 2147483648), _a);
    QuantizationTable = (_a2 = class {
      constructor() {
        __publicField(this, "precision", []);
        // Quantization precision 8 or 16
        __publicField(this, "tq", [0, 0, 0, 0]);
        // 1: this table is presented
        __publicField(this, "quantTables", createArray(4, 64));
      }
      read(data, table) {
        let count = 0;
        let temp;
        let t;
        let i;
        const length = data.get16();
        count += 2;
        while (count < length) {
          temp = data.get8();
          count += 1;
          t = temp & 15;
          if (t > 3) {
            throw new Error("ERROR: Quantization table ID > 3");
          }
          this.precision[t] = temp >> 4;
          if (this.precision[t] === 0) {
            this.precision[t] = 8;
          } else if (this.precision[t] === 1) {
            this.precision[t] = 16;
          } else {
            throw new Error("ERROR: Quantization table precision error");
          }
          this.tq[t] = 1;
          if (this.precision[t] === 8) {
            for (i = 0; i < 64; i += 1) {
              if (count > length) {
                throw new Error("ERROR: Quantization table format error");
              }
              this.quantTables[t][i] = data.get8();
              count += 1;
            }
            _a2.enhanceQuantizationTable(this.quantTables[t], table);
          } else {
            for (i = 0; i < 64; i += 1) {
              if (count > length) {
                throw new Error("ERROR: Quantization table format error");
              }
              this.quantTables[t][i] = data.get16();
              count += 2;
            }
            _a2.enhanceQuantizationTable(this.quantTables[t], table);
          }
        }
        if (count !== length) {
          throw new Error("ERROR: Quantization table error [count!=Lq]");
        }
        return 1;
      }
    }, // Tables
    __publicField(_a2, "enhanceQuantizationTable", function(qtab, table) {
      for (let i = 0; i < 8; i += 1) {
        qtab[table[0 * 8 + i]] *= 90;
        qtab[table[4 * 8 + i]] *= 90;
        qtab[table[2 * 8 + i]] *= 118;
        qtab[table[6 * 8 + i]] *= 49;
        qtab[table[5 * 8 + i]] *= 71;
        qtab[table[1 * 8 + i]] *= 126;
        qtab[table[7 * 8 + i]] *= 25;
        qtab[table[3 * 8 + i]] *= 106;
      }
      for (let i = 0; i < 8; i += 1) {
        qtab[table[0 + 8 * i]] *= 90;
        qtab[table[4 + 8 * i]] *= 90;
        qtab[table[2 + 8 * i]] *= 118;
        qtab[table[6 + 8 * i]] *= 49;
        qtab[table[5 + 8 * i]] *= 71;
        qtab[table[1 + 8 * i]] *= 126;
        qtab[table[7 + 8 * i]] *= 25;
        qtab[table[3 + 8 * i]] *= 106;
      }
      for (let i = 0; i < 64; i += 1) {
        qtab[i] >>= 6;
      }
    }), _a2);
    ScanComponent = {
      acTabSel: 0,
      // AC table selector
      dcTabSel: 0,
      // DC table selector
      scanCompSel: 0
      // Scan component selector
    };
    ScanHeader = class {
      constructor() {
        __publicField(this, "ah", 0);
        __publicField(this, "al", 0);
        __publicField(this, "numComp", 0);
        // Number of components in the scan
        __publicField(this, "selection", 0);
        // Start of spectral or predictor selection
        __publicField(this, "spectralEnd", 0);
        // End of spectral selection
        __publicField(this, "components", []);
      }
      read(data) {
        let count = 0;
        let i;
        let temp;
        const length = data.get16();
        count += 2;
        this.numComp = data.get8();
        count += 1;
        for (i = 0; i < this.numComp; i += 1) {
          this.components[i] = { ...ScanComponent };
          if (count > length) {
            throw new Error("ERROR: scan header format error");
          }
          this.components[i].scanCompSel = data.get8();
          count += 1;
          temp = data.get8();
          count += 1;
          this.components[i].dcTabSel = temp >> 4;
          this.components[i].acTabSel = temp & 15;
        }
        this.selection = data.get8();
        count += 1;
        this.spectralEnd = data.get8();
        count += 1;
        temp = data.get8();
        this.ah = temp >> 4;
        this.al = temp & 15;
        count += 1;
        if (count !== length) {
          throw new Error("ERROR: scan header format error [count!=Ns]");
        }
        return 1;
      }
    };
    littleEndian = function() {
      const buffer = new ArrayBuffer(2);
      new DataView(buffer).setInt16(
        0,
        256,
        true
        /* littleEndian */
      );
      return new Int16Array(buffer)[0] === 256;
    }();
    Decoder = (_a3 = class {
      /**
       * The Decoder constructor.
       * @property {number} numBytes - number of bytes per component
       * @type {Function}
       */
      constructor(buffer, numBytes) {
        __publicField(this, "buffer", null);
        __publicField(this, "stream", null);
        __publicField(this, "frame", new FrameHeader());
        __publicField(this, "huffTable", new HuffmanTable());
        __publicField(this, "quantTable", new QuantizationTable());
        __publicField(this, "scan", new ScanHeader());
        __publicField(this, "DU", createArray(10, 4, 64));
        // at most 10 data units in a MCU, at most 4 data units in one component
        __publicField(this, "HuffTab", createArray(4, 2, 50 * 256));
        __publicField(this, "IDCT_Source", []);
        __publicField(this, "nBlock", []);
        // number of blocks in the i-th Comp in a scan
        __publicField(this, "acTab", createArray(10, 1));
        // ac HuffTab for the i-th Comp in a scan
        __publicField(this, "dcTab", createArray(10, 1));
        // dc HuffTab for the i-th Comp in a scan
        __publicField(this, "qTab", createArray(10, 1));
        // quantization table for the i-th Comp in a scan
        __publicField(this, "marker", 0);
        __publicField(this, "markerIndex", 0);
        __publicField(this, "numComp", 0);
        __publicField(this, "restartInterval", 0);
        __publicField(this, "selection", 0);
        __publicField(this, "xDim", 0);
        __publicField(this, "yDim", 0);
        __publicField(this, "xLoc", 0);
        __publicField(this, "yLoc", 0);
        __publicField(this, "outputData", null);
        __publicField(this, "restarting", false);
        __publicField(this, "mask", 0);
        __publicField(this, "numBytes", 0);
        __publicField(this, "precision");
        __publicField(this, "components", []);
        __publicField(this, "getter", null);
        __publicField(this, "setter", null);
        __publicField(this, "output", null);
        __publicField(this, "selector", null);
        this.buffer = buffer ?? null;
        this.numBytes = numBytes ?? 0;
      }
      /**
       * Returns decompressed data.
       */
      decompress(buffer, offset, length) {
        const result = this.decode(buffer, offset, length);
        return result.buffer;
      }
      decode(buffer, offset, length, numBytes) {
        let scanNum = 0;
        const pred = [];
        let i;
        let compN;
        const temp = [];
        const index = [];
        let mcuNum;
        if (buffer) {
          this.buffer = buffer;
        }
        if (numBytes !== void 0) {
          this.numBytes = numBytes;
        }
        this.stream = new DataStream(this.buffer, offset, length);
        this.buffer = null;
        this.xLoc = 0;
        this.yLoc = 0;
        let current = this.stream.get16();
        if (current !== 65496) {
          throw new Error("Not a JPEG file");
        }
        current = this.stream.get16();
        while (current >> 4 !== 4092 || current === 65476) {
          switch (current) {
            case 65476:
              this.huffTable.read(this.stream, this.HuffTab);
              break;
            case 65484:
              throw new Error("Program doesn't support arithmetic coding. (format throw new IOException)");
            case 65499:
              this.quantTable.read(this.stream, _a3.TABLE);
              break;
            case 65501:
              this.restartInterval = this.readNumber() ?? 0;
              break;
            case 65504:
            case 65505:
            case 65506:
            case 65507:
            case 65508:
            case 65509:
            case 65510:
            case 65511:
            case 65512:
            case 65513:
            case 65514:
            case 65515:
            case 65516:
            case 65517:
            case 65518:
            case 65519:
              this.readApp();
              break;
            case 65534:
              this.readComment();
              break;
            default:
              if (current >> 8 !== 255) {
                throw new Error("ERROR: format throw new IOException! (decode)");
              }
          }
          current = this.stream.get16();
        }
        if (current < 65472 || current > 65479) {
          throw new Error("ERROR: could not handle arithmetic code!");
        }
        this.frame.read(this.stream);
        current = this.stream.get16();
        do {
          while (current !== 65498) {
            switch (current) {
              case 65476:
                this.huffTable.read(this.stream, this.HuffTab);
                break;
              case 65484:
                throw new Error("Program doesn't support arithmetic coding. (format throw new IOException)");
              case 65499:
                this.quantTable.read(this.stream, _a3.TABLE);
                break;
              case 65501:
                this.restartInterval = this.readNumber() ?? 0;
                break;
              case 65504:
              case 65505:
              case 65506:
              case 65507:
              case 65508:
              case 65509:
              case 65510:
              case 65511:
              case 65512:
              case 65513:
              case 65514:
              case 65515:
              case 65516:
              case 65517:
              case 65518:
              case 65519:
                this.readApp();
                break;
              case 65534:
                this.readComment();
                break;
              default:
                if (current >> 8 !== 255) {
                  throw new Error("ERROR: format throw new IOException! (Parser.decode)");
                }
            }
            current = this.stream.get16();
          }
          this.precision = this.frame.precision;
          this.components = this.frame.components;
          if (!this.numBytes) {
            this.numBytes = Math.round(Math.ceil(this.precision / 8));
          }
          if (this.numBytes === 1) {
            this.mask = 255;
          } else {
            this.mask = 65535;
          }
          this.scan.read(this.stream);
          this.numComp = this.scan.numComp;
          this.selection = this.scan.selection;
          if (this.numBytes === 1) {
            if (this.numComp === 3) {
              this.getter = this.getValueRGB;
              this.setter = this.setValueRGB;
              this.output = this.outputRGB;
            } else {
              this.getter = this.getValue8;
              this.setter = this.setValue8;
              this.output = this.outputSingle;
            }
          } else {
            this.getter = this.getValue8;
            this.setter = this.setValue8;
            this.output = this.outputSingle;
          }
          switch (this.selection) {
            case 2:
              this.selector = this.select2;
              break;
            case 3:
              this.selector = this.select3;
              break;
            case 4:
              this.selector = this.select4;
              break;
            case 5:
              this.selector = this.select5;
              break;
            case 6:
              this.selector = this.select6;
              break;
            case 7:
              this.selector = this.select7;
              break;
            default:
              this.selector = this.select1;
              break;
          }
          for (i = 0; i < this.numComp; i += 1) {
            compN = this.scan.components[i].scanCompSel;
            this.qTab[i] = this.quantTable.quantTables[this.components[compN].quantTableSel];
            this.nBlock[i] = this.components[compN].vSamp * this.components[compN].hSamp;
            this.dcTab[i] = this.HuffTab[this.scan.components[i].dcTabSel][0];
            this.acTab[i] = this.HuffTab[this.scan.components[i].acTabSel][1];
          }
          this.xDim = this.frame.dimX;
          this.yDim = this.frame.dimY;
          if (this.numBytes === 1) {
            this.outputData = new Uint8Array(new ArrayBuffer(this.xDim * this.yDim * this.numBytes * this.numComp));
          } else {
            this.outputData = new Uint16Array(new ArrayBuffer(this.xDim * this.yDim * this.numBytes * this.numComp));
          }
          scanNum += 1;
          while (true) {
            temp[0] = 0;
            index[0] = 0;
            for (i = 0; i < 10; i += 1) {
              pred[i] = 1 << this.precision - 1;
            }
            if (this.restartInterval === 0) {
              current = this.decodeUnit(pred, temp, index);
              while (current === 0 && this.xLoc < this.xDim && this.yLoc < this.yDim) {
                this.output(pred);
                current = this.decodeUnit(pred, temp, index);
              }
              break;
            }
            for (mcuNum = 0; mcuNum < this.restartInterval; mcuNum += 1) {
              this.restarting = mcuNum === 0;
              current = this.decodeUnit(pred, temp, index);
              this.output(pred);
              if (current !== 0) {
                break;
              }
            }
            if (current === 0) {
              if (this.markerIndex !== 0) {
                current = 65280 | this.marker;
                this.markerIndex = 0;
              } else {
                current = this.stream.get16();
              }
            }
            if (!(current >= _a3.RESTART_MARKER_BEGIN && current <= _a3.RESTART_MARKER_END)) {
              break;
            }
          }
          if (current === 65500 && scanNum === 1) {
            this.readNumber();
            current = this.stream.get16();
          }
        } while (current !== 65497 && this.xLoc < this.xDim && this.yLoc < this.yDim && scanNum === 0);
        return this.outputData;
      }
      decodeUnit(prev, temp, index) {
        if (this.numComp === 1) {
          return this.decodeSingle(prev, temp, index);
        } else if (this.numComp === 3) {
          return this.decodeRGB(prev, temp, index);
        } else {
          return -1;
        }
      }
      select1(compOffset) {
        return this.getPreviousX(compOffset);
      }
      select2(compOffset) {
        return this.getPreviousY(compOffset);
      }
      select3(compOffset) {
        return this.getPreviousXY(compOffset);
      }
      select4(compOffset) {
        return this.getPreviousX(compOffset) + this.getPreviousY(compOffset) - this.getPreviousXY(compOffset);
      }
      select5(compOffset) {
        return this.getPreviousX(compOffset) + (this.getPreviousY(compOffset) - this.getPreviousXY(compOffset) >> 1);
      }
      select6(compOffset) {
        return this.getPreviousY(compOffset) + (this.getPreviousX(compOffset) - this.getPreviousXY(compOffset) >> 1);
      }
      select7(compOffset) {
        return (this.getPreviousX(compOffset) + this.getPreviousY(compOffset)) / 2;
      }
      decodeRGB(prev, temp, index) {
        if (this.selector === null)
          throw new Error("decode hasn't run yet");
        let actab, dctab, qtab, ctrC, i, k, j;
        prev[0] = this.selector(0);
        prev[1] = this.selector(1);
        prev[2] = this.selector(2);
        for (ctrC = 0; ctrC < this.numComp; ctrC += 1) {
          qtab = this.qTab[ctrC];
          actab = this.acTab[ctrC];
          dctab = this.dcTab[ctrC];
          for (i = 0; i < this.nBlock[ctrC]; i += 1) {
            for (k = 0; k < this.IDCT_Source.length; k += 1) {
              this.IDCT_Source[k] = 0;
            }
            let value = this.getHuffmanValue(dctab, temp, index);
            if (value >= 65280) {
              return value;
            }
            prev[ctrC] = this.IDCT_Source[0] = prev[ctrC] + this.getn(index, value, temp, index);
            this.IDCT_Source[0] *= qtab[0];
            for (j = 1; j < 64; j += 1) {
              value = this.getHuffmanValue(actab, temp, index);
              if (value >= 65280) {
                return value;
              }
              j += value >> 4;
              if ((value & 15) === 0) {
                if (value >> 4 === 0) {
                  break;
                }
              } else {
                this.IDCT_Source[_a3.IDCT_P[j]] = this.getn(index, value & 15, temp, index) * qtab[j];
              }
            }
          }
        }
        return 0;
      }
      decodeSingle(prev, temp, index) {
        if (this.selector === null)
          throw new Error("decode hasn't run yet");
        let value, i, n, nRestart;
        if (this.restarting) {
          this.restarting = false;
          prev[0] = 1 << this.frame.precision - 1;
        } else {
          prev[0] = this.selector();
        }
        for (i = 0; i < this.nBlock[0]; i += 1) {
          value = this.getHuffmanValue(this.dcTab[0], temp, index);
          if (value >= 65280) {
            return value;
          }
          n = this.getn(prev, value, temp, index);
          nRestart = n >> 8;
          if (nRestart >= _a3.RESTART_MARKER_BEGIN && nRestart <= _a3.RESTART_MARKER_END) {
            return nRestart;
          }
          prev[0] += n;
        }
        return 0;
      }
      //	Huffman table for fast search: (HuffTab) 8-bit Look up table 2-layer search architecture, 1st-layer represent 256 node (8 bits) if codeword-length > 8
      //	bits, then the entry of 1st-layer = (# of 2nd-layer table) | MSB and it is stored in the 2nd-layer Size of tables in each layer are 256.
      //	HuffTab[*][*][0-256] is always the only 1st-layer table.
      //
      //	An entry can be: (1) (# of 2nd-layer table) | MSB , for code length > 8 in 1st-layer (2) (Code length) << 8 | HuffVal
      //
      //	HuffmanValue(table   HuffTab[x][y] (ex) HuffmanValue(HuffTab[1][0],...)
      //	                ):
      //	    return: Huffman Value of table
      //	            0xFF?? if it receives a MARKER
      //	    Parameter:  table   HuffTab[x][y] (ex) HuffmanValue(HuffTab[1][0],...)
      //	                temp    temp storage for remainded bits
      //	                index   index to bit of temp
      //	                in      FILE pointer
      //	    Effect:
      //	        temp  store new remainded bits
      //	        index change to new index
      //	        in    change to new position
      //	    NOTE:
      //	      Initial by   temp=0; index=0;
      //	    NOTE: (explain temp and index)
      //	      temp: is always in the form at calling time or returning time
      //	       |  byte 4  |  byte 3  |  byte 2  |  byte 1  |
      //	       |     0    |     0    | 00000000 | 00000??? |  if not a MARKER
      //	                                               ^index=3 (from 0 to 15)
      //	                                               321
      //	    NOTE (marker and marker_index):
      //	      If get a MARKER from 'in', marker=the low-byte of the MARKER
      //	        and marker_index=9
      //	      If marker_index=9 then index is always > 8, or HuffmanValue()
      //	        will not be called
      getHuffmanValue(table, temp, index) {
        let code, input;
        const mask = 65535;
        if (!this.stream)
          throw new Error("stream not initialized");
        if (index[0] < 8) {
          temp[0] <<= 8;
          input = this.stream.get8();
          if (input === 255) {
            this.marker = this.stream.get8();
            if (this.marker !== 0) {
              this.markerIndex = 9;
            }
          }
          temp[0] |= input;
        } else {
          index[0] -= 8;
        }
        code = table[temp[0] >> index[0]];
        if ((code & _a3.MSB) !== 0) {
          if (this.markerIndex !== 0) {
            this.markerIndex = 0;
            return 65280 | this.marker;
          }
          temp[0] &= mask >> 16 - index[0];
          temp[0] <<= 8;
          input = this.stream.get8();
          if (input === 255) {
            this.marker = this.stream.get8();
            if (this.marker !== 0) {
              this.markerIndex = 9;
            }
          }
          temp[0] |= input;
          code = table[(code & 255) * 256 + (temp[0] >> index[0])];
          index[0] += 8;
        }
        index[0] += 8 - (code >> 8);
        if (index[0] < 0) {
          throw new Error("index=" + index[0] + " temp=" + temp[0] + " code=" + code + " in HuffmanValue()");
        }
        if (index[0] < this.markerIndex) {
          this.markerIndex = 0;
          return 65280 | this.marker;
        }
        temp[0] &= mask >> 16 - index[0];
        return code & 255;
      }
      getn(PRED, n, temp, index) {
        let result, input;
        const one = 1;
        const n_one = -1;
        const mask = 65535;
        if (this.stream === null)
          throw new Error("stream not initialized");
        if (n === 0) {
          return 0;
        }
        if (n === 16) {
          if (PRED[0] >= 0) {
            return -32768;
          } else {
            return 32768;
          }
        }
        index[0] -= n;
        if (index[0] >= 0) {
          if (index[0] < this.markerIndex && !this.isLastPixel()) {
            this.markerIndex = 0;
            return (65280 | this.marker) << 8;
          }
          result = temp[0] >> index[0];
          temp[0] &= mask >> 16 - index[0];
        } else {
          temp[0] <<= 8;
          input = this.stream.get8();
          if (input === 255) {
            this.marker = this.stream.get8();
            if (this.marker !== 0) {
              this.markerIndex = 9;
            }
          }
          temp[0] |= input;
          index[0] += 8;
          if (index[0] < 0) {
            if (this.markerIndex !== 0) {
              this.markerIndex = 0;
              return (65280 | this.marker) << 8;
            }
            temp[0] <<= 8;
            input = this.stream.get8();
            if (input === 255) {
              this.marker = this.stream.get8();
              if (this.marker !== 0) {
                this.markerIndex = 9;
              }
            }
            temp[0] |= input;
            index[0] += 8;
          }
          if (index[0] < 0) {
            throw new Error("index=" + index[0] + " in getn()");
          }
          if (index[0] < this.markerIndex) {
            this.markerIndex = 0;
            return (65280 | this.marker) << 8;
          }
          result = temp[0] >> index[0];
          temp[0] &= mask >> 16 - index[0];
        }
        if (result < one << n - 1) {
          result += (n_one << n) + 1;
        }
        return result;
      }
      getPreviousX(compOffset = 0) {
        if (this.getter === null)
          throw new Error("decode hasn't run yet");
        if (this.xLoc > 0) {
          return this.getter(this.yLoc * this.xDim + this.xLoc - 1, compOffset);
        } else if (this.yLoc > 0) {
          return this.getPreviousY(compOffset);
        } else {
          return 1 << this.frame.precision - 1;
        }
      }
      getPreviousXY(compOffset = 0) {
        if (this.getter === null)
          throw new Error("decode hasn't run yet");
        if (this.xLoc > 0 && this.yLoc > 0) {
          return this.getter((this.yLoc - 1) * this.xDim + this.xLoc - 1, compOffset);
        } else {
          return this.getPreviousY(compOffset);
        }
      }
      getPreviousY(compOffset = 0) {
        if (this.getter === null)
          throw new Error("decode hasn't run yet");
        if (this.yLoc > 0) {
          return this.getter((this.yLoc - 1) * this.xDim + this.xLoc, compOffset);
        } else {
          return this.getPreviousX(compOffset);
        }
      }
      isLastPixel() {
        return this.xLoc === this.xDim - 1 && this.yLoc === this.yDim - 1;
      }
      outputSingle(PRED) {
        if (this.setter === null)
          throw new Error("decode hasn't run yet");
        if (this.xLoc < this.xDim && this.yLoc < this.yDim) {
          this.setter(this.yLoc * this.xDim + this.xLoc, this.mask & PRED[0]);
          this.xLoc += 1;
          if (this.xLoc >= this.xDim) {
            this.yLoc += 1;
            this.xLoc = 0;
          }
        }
      }
      outputRGB(PRED) {
        if (this.setter === null)
          throw new Error("decode hasn't run yet");
        const offset = this.yLoc * this.xDim + this.xLoc;
        if (this.xLoc < this.xDim && this.yLoc < this.yDim) {
          this.setter(offset, PRED[0], 0);
          this.setter(offset, PRED[1], 1);
          this.setter(offset, PRED[2], 2);
          this.xLoc += 1;
          if (this.xLoc >= this.xDim) {
            this.yLoc += 1;
            this.xLoc = 0;
          }
        }
      }
      setValue8(index, val) {
        if (!this.outputData)
          throw new Error("output data not ready");
        if (littleEndian) {
          this.outputData[index] = val;
        } else {
          this.outputData[index] = (val & 255) << 8 | val >> 8 & 255;
        }
      }
      getValue8(index) {
        if (this.outputData === null)
          throw new Error("output data not ready");
        if (littleEndian) {
          return this.outputData[index];
        } else {
          const val = this.outputData[index];
          return (val & 255) << 8 | val >> 8 & 255;
        }
      }
      setValueRGB(index, val, compOffset = 0) {
        if (this.outputData === null)
          return;
        this.outputData[index * 3 + compOffset] = val;
      }
      getValueRGB(index, compOffset) {
        if (this.outputData === null)
          throw new Error("output data not ready");
        return this.outputData[index * 3 + compOffset];
      }
      readApp() {
        if (this.stream === null)
          return null;
        let count = 0;
        const length = this.stream.get16();
        count += 2;
        while (count < length) {
          this.stream.get8();
          count += 1;
        }
        return length;
      }
      readComment() {
        if (this.stream === null)
          return null;
        let sb = "";
        let count = 0;
        const length = this.stream.get16();
        count += 2;
        while (count < length) {
          sb += this.stream.get8();
          count += 1;
        }
        return sb;
      }
      readNumber() {
        if (this.stream === null)
          return null;
        const Ld = this.stream.get16();
        if (Ld !== 4) {
          throw new Error("ERROR: Define number format throw new IOException [Ld!=4]");
        }
        return this.stream.get16();
      }
    }, __publicField(_a3, "IDCT_P", [
      0,
      5,
      40,
      16,
      45,
      2,
      7,
      42,
      21,
      56,
      8,
      61,
      18,
      47,
      1,
      4,
      41,
      23,
      58,
      13,
      32,
      24,
      37,
      10,
      63,
      17,
      44,
      3,
      6,
      43,
      20,
      57,
      15,
      34,
      29,
      48,
      53,
      26,
      39,
      9,
      60,
      19,
      46,
      22,
      59,
      12,
      33,
      31,
      50,
      55,
      25,
      36,
      11,
      62,
      14,
      35,
      28,
      49,
      52,
      27,
      38,
      30,
      51,
      54
    ]), __publicField(_a3, "TABLE", [
      0,
      1,
      5,
      6,
      14,
      15,
      27,
      28,
      2,
      4,
      7,
      13,
      16,
      26,
      29,
      42,
      3,
      8,
      12,
      17,
      25,
      30,
      41,
      43,
      9,
      11,
      18,
      24,
      31,
      40,
      44,
      53,
      10,
      19,
      23,
      32,
      39,
      45,
      52,
      54,
      20,
      22,
      33,
      38,
      46,
      51,
      55,
      60,
      21,
      34,
      37,
      47,
      50,
      56,
      59,
      61,
      35,
      36,
      48,
      49,
      57,
      58,
      62,
      63
    ]), __publicField(_a3, "MAX_HUFFMAN_SUBTREE", 50), __publicField(_a3, "MSB", 2147483648), __publicField(_a3, "RESTART_MARKER_BEGIN", 65488), __publicField(_a3, "RESTART_MARKER_END", 65495), _a3);
  }
});

// ../../../INGENI~1/AppData/Local/Temp/opencode/cs3/node_modules/@cornerstonejs/dicom-image-loader/dist/esm/shared/scaling/bilinear.js
function bilinear(src, dest) {
  const { rows: srcRows, columns: srcColumns, data: srcData } = src;
  const { rows, columns, data } = dest;
  const xSrc1Off = [];
  const xSrc2Off = [];
  const xFrac = [];
  for (let x = 0; x < columns; x++) {
    const xSrc = x * (srcColumns - 1) / (columns - 1);
    xSrc1Off[x] = Math.floor(xSrc);
    xSrc2Off[x] = Math.min(xSrc1Off[x] + 1, srcColumns - 1);
    xFrac[x] = xSrc - xSrc1Off[x];
  }
  for (let y = 0; y < rows; y++) {
    const ySrc = y * (srcRows - 1) / (rows - 1);
    const ySrc1Off = Math.floor(ySrc) * srcColumns;
    const ySrc2Off = Math.min(ySrc1Off + srcColumns, (srcRows - 1) * srcColumns);
    const yFrac = ySrc - Math.floor(ySrc);
    const yFracInv = 1 - yFrac;
    const yOff = y * columns;
    for (let x = 0; x < columns; x++) {
      const p00 = srcData[ySrc1Off + xSrc1Off[x]];
      const p10 = srcData[ySrc1Off + xSrc2Off[x]];
      const p01 = srcData[ySrc2Off + xSrc1Off[x]];
      const p11 = srcData[ySrc2Off + xSrc2Off[x]];
      const xFracInv = 1 - xFrac[x];
      data[yOff + x] = (p00 * xFracInv + p10 * xFrac[x]) * yFracInv + (p01 * xFracInv + p11 * xFrac[x]) * yFrac;
    }
  }
  return data;
}

// ../../../INGENI~1/AppData/Local/Temp/opencode/cs3/node_modules/@cornerstonejs/dicom-image-loader/dist/esm/shared/scaling/replicate.js
function replicate(src, dest) {
  const { rows: srcRows, columns: srcColumns, pixelData: srcData, samplesPerPixel = 1 } = src;
  const { rows, columns, pixelData } = dest;
  const xSrc1Off = [];
  for (let x = 0; x < columns; x++) {
    const xSrc = x * (srcColumns - 1) / (columns - 1);
    xSrc1Off[x] = Math.floor(xSrc) * samplesPerPixel;
  }
  for (let y = 0; y < rows; y++) {
    const ySrc = y * (srcRows - 1) / (rows - 1);
    const ySrc1Off = Math.floor(ySrc) * srcColumns * samplesPerPixel;
    const yOff = y * columns;
    for (let x = 0; x < columns; x++) {
      for (let sample = 0; sample < samplesPerPixel; sample++) {
        pixelData[yOff + x + sample] = srcData[ySrc1Off + xSrc1Off[x] + sample];
      }
    }
  }
  return pixelData;
}

// ../../../INGENI~1/AppData/Local/Temp/opencode/cs3/node_modules/comlink/dist/esm/comlink.mjs
var proxyMarker = Symbol("Comlink.proxy");
var createEndpoint = Symbol("Comlink.endpoint");
var releaseProxy = Symbol("Comlink.releaseProxy");
var finalizer = Symbol("Comlink.finalizer");
var throwMarker = Symbol("Comlink.thrown");
var isObject = (val) => typeof val === "object" && val !== null || typeof val === "function";
var proxyTransferHandler = {
  canHandle: (val) => isObject(val) && val[proxyMarker],
  serialize(obj2) {
    const { port1, port2 } = new MessageChannel();
    expose(obj2, port1);
    return [port2, [port2]];
  },
  deserialize(port) {
    port.start();
    return wrap(port);
  }
};
var throwTransferHandler = {
  canHandle: (value) => isObject(value) && throwMarker in value,
  serialize({ value }) {
    let serialized;
    if (value instanceof Error) {
      serialized = {
        isError: true,
        value: {
          message: value.message,
          name: value.name,
          stack: value.stack
        }
      };
    } else {
      serialized = { isError: false, value };
    }
    return [serialized, []];
  },
  deserialize(serialized) {
    if (serialized.isError) {
      throw Object.assign(new Error(serialized.value.message), serialized.value);
    }
    throw serialized.value;
  }
};
var transferHandlers = /* @__PURE__ */ new Map([
  ["proxy", proxyTransferHandler],
  ["throw", throwTransferHandler]
]);
function isAllowedOrigin(allowedOrigins, origin) {
  for (const allowedOrigin of allowedOrigins) {
    if (origin === allowedOrigin || allowedOrigin === "*") {
      return true;
    }
    if (allowedOrigin instanceof RegExp && allowedOrigin.test(origin)) {
      return true;
    }
  }
  return false;
}
function expose(obj2, ep = globalThis, allowedOrigins = ["*"]) {
  ep.addEventListener("message", function callback(ev) {
    if (!ev || !ev.data) {
      return;
    }
    if (!isAllowedOrigin(allowedOrigins, ev.origin)) {
      console.warn(`Invalid origin '${ev.origin}' for comlink proxy`);
      return;
    }
    const { id, type, path } = Object.assign({ path: [] }, ev.data);
    const argumentList = (ev.data.argumentList || []).map(fromWireValue);
    let returnValue;
    try {
      const parent = path.slice(0, -1).reduce((obj3, prop) => obj3[prop], obj2);
      const rawValue = path.reduce((obj3, prop) => obj3[prop], obj2);
      switch (type) {
        case "GET":
          {
            returnValue = rawValue;
          }
          break;
        case "SET":
          {
            parent[path.slice(-1)[0]] = fromWireValue(ev.data.value);
            returnValue = true;
          }
          break;
        case "APPLY":
          {
            returnValue = rawValue.apply(parent, argumentList);
          }
          break;
        case "CONSTRUCT":
          {
            const value = new rawValue(...argumentList);
            returnValue = proxy(value);
          }
          break;
        case "ENDPOINT":
          {
            const { port1, port2 } = new MessageChannel();
            expose(obj2, port2);
            returnValue = transfer(port1, [port1]);
          }
          break;
        case "RELEASE":
          {
            returnValue = void 0;
          }
          break;
        default:
          return;
      }
    } catch (value) {
      returnValue = { value, [throwMarker]: 0 };
    }
    Promise.resolve(returnValue).catch((value) => {
      return { value, [throwMarker]: 0 };
    }).then((returnValue2) => {
      const [wireValue, transferables] = toWireValue(returnValue2);
      ep.postMessage(Object.assign(Object.assign({}, wireValue), { id }), transferables);
      if (type === "RELEASE") {
        ep.removeEventListener("message", callback);
        closeEndPoint(ep);
        if (finalizer in obj2 && typeof obj2[finalizer] === "function") {
          obj2[finalizer]();
        }
      }
    }).catch((error) => {
      const [wireValue, transferables] = toWireValue({
        value: new TypeError("Unserializable return value"),
        [throwMarker]: 0
      });
      ep.postMessage(Object.assign(Object.assign({}, wireValue), { id }), transferables);
    });
  });
  if (ep.start) {
    ep.start();
  }
}
function isMessagePort(endpoint) {
  return endpoint.constructor.name === "MessagePort";
}
function closeEndPoint(endpoint) {
  if (isMessagePort(endpoint))
    endpoint.close();
}
function wrap(ep, target) {
  const pendingListeners = /* @__PURE__ */ new Map();
  ep.addEventListener("message", function handleMessage(ev) {
    const { data } = ev;
    if (!data || !data.id) {
      return;
    }
    const resolver = pendingListeners.get(data.id);
    if (!resolver) {
      return;
    }
    try {
      resolver(data);
    } finally {
      pendingListeners.delete(data.id);
    }
  });
  return createProxy(ep, pendingListeners, [], target);
}
function throwIfProxyReleased(isReleased) {
  if (isReleased) {
    throw new Error("Proxy has been released and is not useable");
  }
}
function releaseEndpoint(ep) {
  return requestResponseMessage(ep, /* @__PURE__ */ new Map(), {
    type: "RELEASE"
  }).then(() => {
    closeEndPoint(ep);
  });
}
var proxyCounter = /* @__PURE__ */ new WeakMap();
var proxyFinalizers = "FinalizationRegistry" in globalThis && new FinalizationRegistry((ep) => {
  const newCount = (proxyCounter.get(ep) || 0) - 1;
  proxyCounter.set(ep, newCount);
  if (newCount === 0) {
    releaseEndpoint(ep);
  }
});
function registerProxy(proxy2, ep) {
  const newCount = (proxyCounter.get(ep) || 0) + 1;
  proxyCounter.set(ep, newCount);
  if (proxyFinalizers) {
    proxyFinalizers.register(proxy2, ep, proxy2);
  }
}
function unregisterProxy(proxy2) {
  if (proxyFinalizers) {
    proxyFinalizers.unregister(proxy2);
  }
}
function createProxy(ep, pendingListeners, path = [], target = function() {
}) {
  let isProxyReleased = false;
  const proxy2 = new Proxy(target, {
    get(_target, prop) {
      throwIfProxyReleased(isProxyReleased);
      if (prop === releaseProxy) {
        return () => {
          unregisterProxy(proxy2);
          releaseEndpoint(ep);
          pendingListeners.clear();
          isProxyReleased = true;
        };
      }
      if (prop === "then") {
        if (path.length === 0) {
          return { then: () => proxy2 };
        }
        const r = requestResponseMessage(ep, pendingListeners, {
          type: "GET",
          path: path.map((p) => p.toString())
        }).then(fromWireValue);
        return r.then.bind(r);
      }
      return createProxy(ep, pendingListeners, [...path, prop]);
    },
    set(_target, prop, rawValue) {
      throwIfProxyReleased(isProxyReleased);
      const [value, transferables] = toWireValue(rawValue);
      return requestResponseMessage(ep, pendingListeners, {
        type: "SET",
        path: [...path, prop].map((p) => p.toString()),
        value
      }, transferables).then(fromWireValue);
    },
    apply(_target, _thisArg, rawArgumentList) {
      throwIfProxyReleased(isProxyReleased);
      const last = path[path.length - 1];
      if (last === createEndpoint) {
        return requestResponseMessage(ep, pendingListeners, {
          type: "ENDPOINT"
        }).then(fromWireValue);
      }
      if (last === "bind") {
        return createProxy(ep, pendingListeners, path.slice(0, -1));
      }
      const [argumentList, transferables] = processArguments(rawArgumentList);
      return requestResponseMessage(ep, pendingListeners, {
        type: "APPLY",
        path: path.map((p) => p.toString()),
        argumentList
      }, transferables).then(fromWireValue);
    },
    construct(_target, rawArgumentList) {
      throwIfProxyReleased(isProxyReleased);
      const [argumentList, transferables] = processArguments(rawArgumentList);
      return requestResponseMessage(ep, pendingListeners, {
        type: "CONSTRUCT",
        path: path.map((p) => p.toString()),
        argumentList
      }, transferables).then(fromWireValue);
    }
  });
  registerProxy(proxy2, ep);
  return proxy2;
}
function myFlat(arr) {
  return Array.prototype.concat.apply([], arr);
}
function processArguments(argumentList) {
  const processed = argumentList.map(toWireValue);
  return [processed.map((v) => v[0]), myFlat(processed.map((v) => v[1]))];
}
var transferCache = /* @__PURE__ */ new WeakMap();
function transfer(obj2, transfers) {
  transferCache.set(obj2, transfers);
  return obj2;
}
function proxy(obj2) {
  return Object.assign(obj2, { [proxyMarker]: true });
}
function toWireValue(value) {
  for (const [name, handler] of transferHandlers) {
    if (handler.canHandle(value)) {
      const [serializedValue, transferables] = handler.serialize(value);
      return [
        {
          type: "HANDLER",
          name,
          value: serializedValue
        },
        transferables
      ];
    }
  }
  return [
    {
      type: "RAW",
      value
    },
    transferCache.get(value) || []
  ];
}
function fromWireValue(value) {
  switch (value.type) {
    case "HANDLER":
      return transferHandlers.get(value.name).deserialize(value.value);
    case "RAW":
      return value.value;
  }
}
function requestResponseMessage(ep, pendingListeners, msg, transfers) {
  return new Promise((resolve) => {
    const id = generateUUID();
    pendingListeners.set(id, resolve);
    if (ep.start) {
      ep.start();
    }
    ep.postMessage(Object.assign({ id }, msg), transfers);
  });
}
function generateUUID() {
  return new Array(4).fill(0).map(() => Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16)).join("-");
}

// ../../../INGENI~1/AppData/Local/Temp/opencode/cs3/node_modules/@cornerstonejs/dicom-image-loader/dist/esm/shared/decoders/decodeLittleEndian.js
async function decodeLittleEndian(imageFrame, pixelData) {
  let arrayBuffer = pixelData.buffer;
  let offset = pixelData.byteOffset;
  const length = pixelData.length;
  if (imageFrame.bitsAllocated === 16) {
    if (offset % 2) {
      arrayBuffer = arrayBuffer.slice(offset);
      offset = 0;
    }
    if (imageFrame.pixelRepresentation === 0) {
      imageFrame.pixelData = new Uint16Array(arrayBuffer, offset, length / 2);
    } else {
      imageFrame.pixelData = new Int16Array(arrayBuffer, offset, length / 2);
    }
  } else if (imageFrame.bitsAllocated === 8 || imageFrame.bitsAllocated === 1) {
    imageFrame.pixelData = pixelData;
  } else if (imageFrame.bitsAllocated === 32) {
    if (offset % 2) {
      arrayBuffer = arrayBuffer.slice(offset);
      offset = 0;
    }
    if (imageFrame.floatPixelData || imageFrame.doubleFloatPixelData) {
      throw new Error("Float pixel data is not supported for parsing into ImageFrame");
    }
    if (imageFrame.pixelRepresentation === 0) {
      imageFrame.pixelData = new Uint32Array(arrayBuffer, offset, length / 4);
    } else if (imageFrame.pixelRepresentation === 1) {
      imageFrame.pixelData = new Int32Array(arrayBuffer, offset, length / 4);
    } else {
      imageFrame.pixelData = new Float32Array(arrayBuffer, offset, length / 4);
    }
  }
  return imageFrame;
}
var decodeLittleEndian_default = decodeLittleEndian;

// ../../../INGENI~1/AppData/Local/Temp/opencode/cs3/node_modules/@cornerstonejs/dicom-image-loader/dist/esm/shared/decoders/decodeBigEndian.js
function swap16(val) {
  return (val & 255) << 8 | val >> 8 & 255;
}
async function decodeBigEndian(imageFrame, pixelData) {
  if (imageFrame.bitsAllocated === 16) {
    let arrayBuffer = pixelData.buffer;
    let offset = pixelData.byteOffset;
    const length = pixelData.length;
    if (offset % 2) {
      arrayBuffer = arrayBuffer.slice(offset);
      offset = 0;
    }
    if (imageFrame.pixelRepresentation === 0) {
      imageFrame.pixelData = new Uint16Array(arrayBuffer, offset, length / 2);
    } else {
      imageFrame.pixelData = new Int16Array(arrayBuffer, offset, length / 2);
    }
    for (let i = 0; i < imageFrame.pixelData.length; i++) {
      imageFrame.pixelData[i] = swap16(imageFrame.pixelData[i]);
    }
  } else if (imageFrame.bitsAllocated === 8) {
    imageFrame.pixelData = pixelData;
  }
  return imageFrame;
}
var decodeBigEndian_default = decodeBigEndian;

// ../../../INGENI~1/AppData/Local/Temp/opencode/cs3/node_modules/@cornerstonejs/dicom-image-loader/dist/esm/shared/decoders/decodeRLE.js
async function decodeRLE(imageFrame, pixelData) {
  if (imageFrame.bitsAllocated === 8) {
    if (imageFrame.planarConfiguration) {
      return decode8Planar(imageFrame, pixelData);
    }
    return decode8(imageFrame, pixelData);
  } else if (imageFrame.bitsAllocated === 16) {
    return decode16(imageFrame, pixelData);
  } else if (imageFrame.bitsAllocated === 1) {
    return decode8Planar(imageFrame, pixelData, true);
  }
  throw new Error("unsupported pixel format for RLE");
}
function getFrameSize(imageFrame, isOneBit = false) {
  const pixelCount = imageFrame.rows * imageFrame.columns;
  return isOneBit ? Math.ceil(pixelCount / 8) : pixelCount;
}
function unpackOneBitPlanar(packed, imageFrame, frameSize) {
  const pixelsPerPlane = imageFrame.rows * imageFrame.columns;
  const unpacked = new Uint8Array(pixelsPerPlane * imageFrame.samplesPerPixel);
  for (let s = 0; s < imageFrame.samplesPerPixel; s++) {
    const planeOffset = s * frameSize;
    for (let i = 0; i < pixelsPerPlane; i++) {
      const bytePos = planeOffset + Math.floor(i / 8);
      const bitPos = i % 8;
      unpacked[s * pixelsPerPlane + i] = packed[bytePos] & 1 << bitPos ? 1 : 0;
    }
  }
  return unpacked;
}
function decode8(imageFrame, pixelData, isOneBit = false) {
  const frameData = pixelData;
  const frameSize = getFrameSize(imageFrame, isOneBit);
  const outFrame = new ArrayBuffer(frameSize * imageFrame.samplesPerPixel);
  const header = new DataView(frameData.buffer, frameData.byteOffset);
  const data = new Int8Array(frameData.buffer, frameData.byteOffset);
  const out = new Int8Array(outFrame);
  let outIndex = 0;
  const numSegments = header.getInt32(0, true);
  for (let s = 0; s < numSegments; ++s) {
    outIndex = s;
    let inIndex = header.getInt32((s + 1) * 4, true);
    let maxIndex = header.getInt32((s + 2) * 4, true);
    if (maxIndex === 0) {
      maxIndex = frameData.length;
    }
    const endOfSegment = frameSize * numSegments;
    while (inIndex < maxIndex) {
      const n = data[inIndex++];
      if (n >= 0 && n <= 127) {
        for (let i = 0; i < n + 1 && outIndex < endOfSegment; ++i) {
          out[outIndex] = data[inIndex++];
          outIndex += imageFrame.samplesPerPixel;
        }
      } else if (n <= -1 && n >= -127) {
        const value = data[inIndex++];
        for (let j = 0; j < -n + 1 && outIndex < endOfSegment; ++j) {
          out[outIndex] = value;
          outIndex += imageFrame.samplesPerPixel;
        }
      }
    }
  }
  imageFrame.pixelData = new Uint8Array(outFrame);
  return imageFrame;
}
function decode8Planar(imageFrame, pixelData, isOneBit = false) {
  const frameData = pixelData;
  const frameSize = getFrameSize(imageFrame, isOneBit);
  const outFrame = new ArrayBuffer(frameSize * imageFrame.samplesPerPixel);
  const header = new DataView(frameData.buffer, frameData.byteOffset);
  const data = new Int8Array(frameData.buffer, frameData.byteOffset);
  const out = new Int8Array(outFrame);
  let outIndex = 0;
  const numSegments = header.getInt32(0, true);
  for (let s = 0; s < numSegments; ++s) {
    outIndex = s * frameSize;
    let inIndex = header.getInt32((s + 1) * 4, true);
    let maxIndex = header.getInt32((s + 2) * 4, true);
    if (maxIndex === 0) {
      maxIndex = frameData.length;
    }
    const endOfSegment = frameSize * numSegments;
    while (inIndex < maxIndex) {
      const n = data[inIndex++];
      if (n >= 0 && n <= 127) {
        for (let i = 0; i < n + 1 && outIndex < endOfSegment; ++i) {
          out[outIndex] = data[inIndex++];
          outIndex++;
        }
      } else if (n <= -1 && n >= -127) {
        const value = data[inIndex++];
        for (let j = 0; j < -n + 1 && outIndex < endOfSegment; ++j) {
          out[outIndex] = value;
          outIndex++;
        }
      }
    }
  }
  imageFrame.pixelData = new Uint8Array(outFrame);
  if (isOneBit) {
    imageFrame.pixelData = unpackOneBitPlanar(imageFrame.pixelData, imageFrame, frameSize);
  }
  return imageFrame;
}
function decode16(imageFrame, pixelData) {
  const frameData = pixelData;
  const frameSize = imageFrame.rows * imageFrame.columns;
  const outFrame = new ArrayBuffer(frameSize * imageFrame.samplesPerPixel * 2);
  const header = new DataView(frameData.buffer, frameData.byteOffset);
  const data = new Int8Array(frameData.buffer, frameData.byteOffset);
  const out = new Int8Array(outFrame);
  const numSegments = header.getInt32(0, true);
  for (let s = 0; s < numSegments; ++s) {
    let outIndex = 0;
    const highByte = s === 0 ? 1 : 0;
    let inIndex = header.getInt32((s + 1) * 4, true);
    let maxIndex = header.getInt32((s + 2) * 4, true);
    if (maxIndex === 0) {
      maxIndex = frameData.length;
    }
    while (inIndex < maxIndex) {
      const n = data[inIndex++];
      if (n >= 0 && n <= 127) {
        for (let i = 0; i < n + 1 && outIndex < frameSize; ++i) {
          out[outIndex * 2 + highByte] = data[inIndex++];
          outIndex++;
        }
      } else if (n <= -1 && n >= -127) {
        const value = data[inIndex++];
        for (let j = 0; j < -n + 1 && outIndex < frameSize; ++j) {
          out[outIndex * 2 + highByte] = value;
          outIndex++;
        }
      }
    }
  }
  if (imageFrame.pixelRepresentation === 0) {
    imageFrame.pixelData = new Uint16Array(outFrame);
  } else {
    imageFrame.pixelData = new Int16Array(outFrame);
  }
  return imageFrame;
}
var decodeRLE_default = decodeRLE;

// empty:emptycodec
var emptycodec_default = {};

// ../../../INGENI~1/AppData/Local/Temp/opencode/cs3/node_modules/@cornerstonejs/dicom-image-loader/dist/esm/shared/decoders/isSignedPixelData.js
function isSignedPixelData(frameInfo) {
  const declaredSigned = frameInfo?.isSigned === true || frameInfo?.isSigned === 1;
  return declaredSigned && frameInfo.componentCount === 1;
}

// ../../../INGENI~1/AppData/Local/Temp/opencode/cs3/node_modules/@cornerstonejs/dicom-image-loader/dist/esm/shared/decoders/getPixelData.js
function getPixelData(frameInfo, decodedBuffer, signedOverride) {
  const signed = isSignedPixelData({
    isSigned: signedOverride ?? frameInfo?.isSigned,
    componentCount: frameInfo?.componentCount
  });
  if (frameInfo?.bitsPerSample > 8) {
    if (signed) {
      return new Int16Array(decodedBuffer.buffer, decodedBuffer.byteOffset, decodedBuffer.byteLength / 2);
    }
    return new Uint16Array(decodedBuffer.buffer, decodedBuffer.byteOffset, decodedBuffer.byteLength / 2);
  }
  if (signed) {
    return new Int8Array(decodedBuffer.buffer, decodedBuffer.byteOffset, decodedBuffer.byteLength);
  }
  return new Uint8Array(decodedBuffer.buffer, decodedBuffer.byteOffset, decodedBuffer.byteLength);
}

// ../../../INGENI~1/AppData/Local/Temp/opencode/cs3/node_modules/@cornerstonejs/dicom-image-loader/dist/esm/shared/wasmBasePath.js
var wasmBasePath;
function setWasmBasePath(basePath) {
  wasmBasePath = basePath || void 0;
}
function setWasmBasePathFromConfig(decodeConfig) {
  if (decodeConfig?.wasmBasePath !== void 0) {
    setWasmBasePath(decodeConfig.wasmBasePath);
  }
}
function resolveWasmUrl(fileName, defaultUrl) {
  if (!wasmBasePath) {
    return defaultUrl.toString();
  }
  const base = wasmBasePath.endsWith("/") ? wasmBasePath : `${wasmBasePath}/`;
  const path = `${base}${fileName}`;
  const href = typeof self !== "undefined" ? self.location?.href : void 0;
  if (!href) {
    return path;
  }
  try {
    return new URL(path, href).toString();
  } catch {
    return path;
  }
}

// ../../../INGENI~1/AppData/Local/Temp/opencode/cs3/node_modules/@cornerstonejs/dicom-image-loader/dist/esm/shared/decoders/decodeJPEGBaseline8Bit.js
var libjpegTurboWasm = new URL("@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasm", import.meta.url);
var local = {
  codec: void 0,
  decoder: void 0
};
function initLibjpegTurbo(decodeConfig) {
  setWasmBasePathFromConfig(decodeConfig);
  if (local.codec) {
    return Promise.resolve();
  }
  const libjpegTurboModule = emptycodec_default({
    locateFile: (f) => {
      if (f.endsWith(".wasm")) {
        return resolveWasmUrl("libjpegturbowasm_decode.wasm", libjpegTurboWasm);
      }
      return f;
    }
  });
  return new Promise((resolve, reject) => {
    libjpegTurboModule.then((instance) => {
      local.codec = instance;
      local.decoder = new instance.JPEGDecoder();
      resolve();
    }, reject);
  });
}
async function decodeAsync(compressedImageFrame, imageInfo) {
  await initLibjpegTurbo();
  const decoder = local.decoder;
  const encodedBufferInWASM = decoder.getEncodedBuffer(compressedImageFrame.length);
  encodedBufferInWASM.set(compressedImageFrame);
  decoder.decode();
  const frameInfo = decoder.getFrameInfo();
  const decodedPixelsInWASM = decoder.getDecodedBuffer();
  const encodedImageInfo = {
    columns: frameInfo.width,
    rows: frameInfo.height,
    bitsPerPixel: frameInfo.bitsPerSample,
    signed: imageInfo.signed,
    bytesPerPixel: imageInfo.bytesPerPixel,
    componentsPerPixel: frameInfo.componentCount
  };
  const pixelData = getPixelData(frameInfo, decodedPixelsInWASM);
  const encodeOptions = {
    frameInfo
  };
  return {
    ...imageInfo,
    pixelData,
    imageInfo: encodedImageInfo,
    encodeOptions,
    ...encodeOptions,
    ...encodedImageInfo
  };
}
var decodeJPEGBaseline8Bit_default = decodeAsync;

// ../../../INGENI~1/AppData/Local/Temp/opencode/cs3/node_modules/@cornerstonejs/dicom-image-loader/dist/esm/shared/decoders/decodeJPEGBaseline12Bit-js.js
var local2 = {
  JpegImage: void 0,
  decodeConfig: {}
};
function initialize(decodeConfig) {
  local2.decodeConfig = decodeConfig;
  if (local2.JpegImage) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    Promise.resolve().then(() => (init_jpeg(), jpeg_exports)).then((module) => {
      local2.JpegImage = module.default;
      resolve();
    }).catch(reject);
  });
}
async function decodeJPEGBaseline12BitAsync(imageFrame, pixelData) {
  await initialize();
  if (typeof local2.JpegImage === "undefined") {
    throw new Error("No JPEG Baseline decoder loaded");
  }
  const jpeg = new local2.JpegImage();
  jpeg.parse(pixelData);
  jpeg.colorTransform = false;
  if (imageFrame.bitsAllocated === 8) {
    imageFrame.pixelData = jpeg.getData(imageFrame.columns, imageFrame.rows);
    return imageFrame;
  } else if (imageFrame.bitsAllocated === 16) {
    imageFrame.pixelData = jpeg.getData16(imageFrame.columns, imageFrame.rows);
    return imageFrame;
  }
}
var decodeJPEGBaseline12Bit_js_default = decodeJPEGBaseline12BitAsync;

// ../../../INGENI~1/AppData/Local/Temp/opencode/cs3/node_modules/@cornerstonejs/dicom-image-loader/dist/esm/shared/decoders/decodeJPEGLossless.js
var local3 = {
  DecoderClass: void 0,
  decodeConfig: {}
};
function initialize2(decodeConfig) {
  local3.decodeConfig = decodeConfig;
  if (local3.DecoderClass) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    Promise.resolve().then(() => (init_lossless(), lossless_exports)).then(({ Decoder: Decoder2 }) => {
      local3.DecoderClass = Decoder2;
      resolve();
    }, reject);
  });
}
async function decodeJPEGLossless(imageFrame, pixelData) {
  await initialize2();
  if (typeof local3.DecoderClass === "undefined") {
    throw new Error("No JPEG Lossless decoder loaded");
  }
  const decoder = new local3.DecoderClass();
  const byteOutput = imageFrame.bitsAllocated <= 8 ? 1 : 2;
  const buffer = pixelData.buffer;
  const decompressedData = decoder.decode(buffer, pixelData.byteOffset, pixelData.length, byteOutput);
  imageFrame.planarConfiguration = 0;
  if (imageFrame.pixelRepresentation === 0) {
    if (imageFrame.bitsAllocated === 16) {
      imageFrame.pixelData = new Uint16Array(decompressedData.buffer);
      return imageFrame;
    }
    imageFrame.pixelData = new Uint8Array(decompressedData.buffer);
    return imageFrame;
  }
  imageFrame.pixelData = new Int16Array(decompressedData.buffer);
  return imageFrame;
}
var decodeJPEGLossless_default = decodeJPEGLossless;

// ../../../INGENI~1/AppData/Local/Temp/opencode/cs3/node_modules/@cornerstonejs/dicom-image-loader/dist/esm/shared/decoders/decodeJPEGLS.js
var charlsWasm = new URL("@cornerstonejs/codec-charls/decodewasm", import.meta.url);
var local4 = {
  codec: void 0,
  decoder: void 0,
  decodeConfig: {}
};
function getExceptionMessage(exception) {
  return typeof exception === "number" ? local4.codec.getExceptionMessage(exception) : exception;
}
function initialize3(decodeConfig) {
  local4.decodeConfig = decodeConfig;
  setWasmBasePathFromConfig(decodeConfig);
  if (local4.codec) {
    return Promise.resolve();
  }
  const charlsModule = emptycodec_default({
    locateFile: (f) => {
      if (f.endsWith(".wasm")) {
        return resolveWasmUrl("charlswasm_decode.wasm", charlsWasm);
      }
      return f;
    }
  });
  return new Promise((resolve, reject) => {
    charlsModule.then((instance) => {
      local4.codec = instance;
      local4.decoder = new instance.JpegLSDecoder();
      resolve();
    }, reject);
  });
}
async function decodeAsync2(compressedImageFrame, imageInfo) {
  try {
    await initialize3();
    const decoder = local4.decoder;
    const encodedBufferInWASM = decoder.getEncodedBuffer(compressedImageFrame.length);
    encodedBufferInWASM.set(compressedImageFrame);
    decoder.decode();
    const frameInfo = decoder.getFrameInfo();
    const interleaveMode = decoder.getInterleaveMode();
    const nearLossless = decoder.getNearLossless();
    const decodedPixelsInWASM = decoder.getDecodedBuffer();
    const encodedImageInfo = {
      columns: frameInfo.width,
      rows: frameInfo.height,
      bitsPerPixel: frameInfo.bitsPerSample,
      signed: imageInfo.signed,
      bytesPerPixel: imageInfo.bytesPerPixel,
      componentsPerPixel: frameInfo.componentCount
    };
    const pixelData = getPixelData(frameInfo, decodedPixelsInWASM, imageInfo.signed);
    const encodeOptions = {
      nearLossless,
      interleaveMode,
      frameInfo
    };
    return {
      ...imageInfo,
      pixelData,
      imageInfo: encodedImageInfo,
      encodeOptions,
      ...encodeOptions,
      ...encodedImageInfo
    };
  } catch (error) {
    throw getExceptionMessage(error);
  }
}
var decodeJPEGLS_default = decodeAsync2;

// ../../../INGENI~1/AppData/Local/Temp/opencode/cs3/node_modules/@cornerstonejs/dicom-image-loader/dist/esm/shared/decoders/decodeJPEG2000.js
var openjpegWasm = new URL("@cornerstonejs/codec-openjpeg/decodewasm", import.meta.url);
var local5 = {
  codec: void 0,
  decoder: void 0,
  decodeConfig: {}
};
function initialize4(decodeConfig) {
  local5.decodeConfig = decodeConfig;
  setWasmBasePathFromConfig(decodeConfig);
  if (local5.codec) {
    return Promise.resolve();
  }
  const openJpegModule = emptycodec_default({
    locateFile: (f) => {
      if (f.endsWith(".wasm")) {
        return resolveWasmUrl("openjpegwasm_decode.wasm", openjpegWasm);
      }
      return f;
    }
  });
  return new Promise((resolve, reject) => {
    openJpegModule.then((instance) => {
      local5.codec = instance;
      local5.decoder = new instance.J2KDecoder();
      resolve();
    }, reject);
  });
}
async function decodeAsync3(compressedImageFrame, imageInfo) {
  await initialize4();
  const decoder = local5.decoder;
  const encodedBufferInWASM = decoder.getEncodedBuffer(compressedImageFrame.length);
  encodedBufferInWASM.set(compressedImageFrame);
  decoder.decode();
  const frameInfo = decoder.getFrameInfo();
  const decodedBufferInWASM = decoder.getDecodedBuffer();
  const imageFrame = new Uint8Array(decodedBufferInWASM.length);
  imageFrame.set(decodedBufferInWASM);
  const imageOffset = `x: ${decoder.getImageOffset().x}, y: ${decoder.getImageOffset().y}`;
  const numDecompositions = decoder.getNumDecompositions();
  const numLayers = decoder.getNumLayers();
  const progessionOrder = ["unknown", "LRCP", "RLCP", "RPCL", "PCRL", "CPRL"][decoder.getProgressionOrder() + 1];
  const reversible = decoder.getIsReversible();
  const blockDimensions = `${decoder.getBlockDimensions().width} x ${decoder.getBlockDimensions().height}`;
  const tileSize = `${decoder.getTileSize().width} x ${decoder.getTileSize().height}`;
  const tileOffset = `${decoder.getTileOffset().x}, ${decoder.getTileOffset().y}`;
  const colorTransform = decoder.getColorSpace();
  const decodedSize = `${decodedBufferInWASM.length.toLocaleString()} bytes`;
  const compressionRatio = `${(decodedBufferInWASM.length / encodedBufferInWASM.length).toFixed(2)}:1`;
  const encodedImageInfo = {
    columns: frameInfo.width,
    rows: frameInfo.height,
    bitsPerPixel: frameInfo.bitsPerSample,
    signed: frameInfo.isSigned,
    bytesPerPixel: imageInfo.bytesPerPixel,
    componentsPerPixel: frameInfo.componentCount
  };
  const pixelData = getPixelData(frameInfo, decodedBufferInWASM);
  const encodeOptions = {
    imageOffset,
    numDecompositions,
    numLayers,
    progessionOrder,
    reversible,
    blockDimensions,
    tileSize,
    tileOffset,
    colorTransform,
    decodedSize,
    compressionRatio
  };
  return {
    ...imageInfo,
    pixelData,
    imageInfo: encodedImageInfo,
    encodeOptions,
    ...encodeOptions,
    ...encodedImageInfo
  };
}
var decodeJPEG2000_default = decodeAsync3;

// ../../../INGENI~1/AppData/Local/Temp/opencode/cs3/node_modules/@cornerstonejs/dicom-image-loader/dist/esm/shared/decoders/decodeHTJ2K.js
var openjphWasm = new URL("@cornerstonejs/codec-openjph/wasm", import.meta.url);
var local6 = {
  codec: void 0,
  decoder: void 0,
  decodeConfig: {}
};
function calculateSizeAtDecompositionLevel(decompositionLevel, frameWidth, frameHeight) {
  const result = { width: frameWidth, height: frameHeight };
  while (decompositionLevel > 0) {
    result.width = Math.ceil(result.width / 2);
    result.height = Math.ceil(result.height / 2);
    decompositionLevel--;
  }
  return result;
}
function initialize5(decodeConfig) {
  local6.decodeConfig = decodeConfig;
  setWasmBasePathFromConfig(decodeConfig);
  if (local6.codec) {
    return Promise.resolve();
  }
  const openJphModule = emptycodec_default({
    locateFile: (f) => {
      if (f.endsWith(".wasm")) {
        return resolveWasmUrl("openjphjs.wasm", openjphWasm);
      }
      return f;
    }
  });
  return new Promise((resolve, reject) => {
    openJphModule.then((instance) => {
      local6.codec = instance;
      local6.decoder = new instance.HTJ2KDecoder();
      resolve();
    }, reject);
  });
}
async function decodeAsync4(compressedImageFrame, imageInfo) {
  await initialize5();
  const decoder = new local6.codec.HTJ2KDecoder();
  const encodedBufferInWASM = decoder.getEncodedBuffer(compressedImageFrame.length);
  encodedBufferInWASM.set(compressedImageFrame);
  const decodeLevel = imageInfo.decodeLevel || 0;
  decoder.decodeSubResolution(decodeLevel);
  const frameInfo = decoder.getFrameInfo();
  if (imageInfo.decodeLevel > 0) {
    const { width, height } = calculateSizeAtDecompositionLevel(imageInfo.decodeLevel, frameInfo.width, frameInfo.height);
    frameInfo.width = width;
    frameInfo.height = height;
  }
  const decodedBufferInWASM = decoder.getDecodedBuffer();
  const imageFrame = new Uint8Array(decodedBufferInWASM.length);
  imageFrame.set(decodedBufferInWASM);
  const imageOffset = `x: ${decoder.getImageOffset().x}, y: ${decoder.getImageOffset().y}`;
  const numDecompositions = decoder.getNumDecompositions();
  const numLayers = decoder.getNumLayers();
  const progessionOrder = ["unknown", "LRCP", "RLCP", "RPCL", "PCRL", "CPRL"][decoder.getProgressionOrder() + 1];
  const reversible = decoder.getIsReversible();
  const blockDimensions = `${decoder.getBlockDimensions().width} x ${decoder.getBlockDimensions().height}`;
  const tileSize = `${decoder.getTileSize().width} x ${decoder.getTileSize().height}`;
  const tileOffset = `${decoder.getTileOffset().x}, ${decoder.getTileOffset().y}`;
  const decodedSize = `${decodedBufferInWASM.length.toLocaleString()} bytes`;
  const compressionRatio = `${(decodedBufferInWASM.length / encodedBufferInWASM.length).toFixed(2)}:1`;
  const encodedImageInfo = {
    columns: frameInfo.width,
    rows: frameInfo.height,
    bitsPerPixel: frameInfo.bitsPerSample,
    signed: frameInfo.isSigned,
    bytesPerPixel: imageInfo.bytesPerPixel,
    componentsPerPixel: frameInfo.componentCount
  };
  let pixelData = getPixelData(frameInfo, decodedBufferInWASM);
  const { buffer: b, byteOffset, byteLength } = pixelData;
  const pixelDataArrayBuffer = b.slice(byteOffset, byteOffset + byteLength);
  pixelData = new pixelData.constructor(pixelDataArrayBuffer);
  const encodeOptions = {
    imageOffset,
    numDecompositions,
    numLayers,
    progessionOrder,
    reversible,
    blockDimensions,
    tileSize,
    tileOffset,
    decodedSize,
    compressionRatio
  };
  return {
    ...imageInfo,
    pixelData,
    imageInfo: encodedImageInfo,
    encodeOptions,
    ...encodeOptions,
    ...encodedImageInfo
  };
}
var decodeHTJ2K_default = decodeAsync4;

// ../../../INGENI~1/AppData/Local/Temp/opencode/cs3/node_modules/@cornerstonejs/dicom-image-loader/dist/esm/shared/scaling/scaleArray.js
function scaleArray(array, scalingParameters) {
  const arrayLength = array.length;
  const { rescaleSlope, rescaleIntercept, suvbw, doseGridScaling } = scalingParameters;
  if (scalingParameters.modality === "PT" && typeof suvbw === "number" && !isNaN(suvbw)) {
    for (let i = 0; i < arrayLength; i++) {
      array[i] = suvbw * (array[i] * rescaleSlope + rescaleIntercept);
    }
  } else if (scalingParameters.modality === "RTDOSE" && typeof doseGridScaling === "number" && !isNaN(doseGridScaling)) {
    for (let i = 0; i < arrayLength; i++) {
      array[i] = array[i] * doseGridScaling;
    }
  } else {
    for (let i = 0; i < arrayLength; i++) {
      array[i] = array[i] * rescaleSlope + rescaleIntercept;
    }
  }
  return true;
}

// ../../../INGENI~1/AppData/Local/Temp/opencode/cs3/node_modules/@cornerstonejs/dicom-image-loader/dist/esm/shared/getMinMax.js
function getMinMax(storedPixelData) {
  let min = storedPixelData[0];
  let max = storedPixelData[0];
  let storedPixel;
  const numPixels = storedPixelData.length;
  for (let index = 1; index < numPixels; index++) {
    storedPixel = storedPixelData[index];
    min = Math.min(min, storedPixel);
    max = Math.max(max, storedPixel);
  }
  return {
    min,
    max
  };
}
var getMinMax_default = getMinMax;

// ../../../INGENI~1/AppData/Local/Temp/opencode/cs3/node_modules/@cornerstonejs/dicom-image-loader/dist/esm/shared/getPixelDataTypeFromMinMax.js
function getPixelDataTypeFromMinMax(min, max) {
  let pixelDataType;
  if (Number.isInteger(min) && Number.isInteger(max)) {
    if (min >= 0) {
      if (max <= 255) {
        pixelDataType = Uint8Array;
      } else if (max <= 65535) {
        pixelDataType = Uint16Array;
      } else if (max <= 4294967295) {
        pixelDataType = Uint32Array;
      }
    } else {
      if (min >= -128 && max <= 127) {
        pixelDataType = Int8Array;
      } else if (min >= -32768 && max <= 32767) {
        pixelDataType = Int16Array;
      }
    }
  }
  return pixelDataType || Float32Array;
}
function validatePixelDataType(min, max, type) {
  const pixelDataType = getPixelDataTypeFromMinMax(min, max);
  return pixelDataType === type;
}

// ../../../INGENI~1/AppData/Local/Temp/opencode/cs3/node_modules/@cornerstonejs/dicom-image-loader/dist/esm/shared/isColorImage.js
function isColorImage_default(photoMetricInterpretation) {
  return photoMetricInterpretation === "RGB" || photoMetricInterpretation === "PALETTE COLOR" || photoMetricInterpretation === "YBR_FULL" || photoMetricInterpretation === "YBR_FULL_422" || photoMetricInterpretation === "YBR_PARTIAL_422" || photoMetricInterpretation === "YBR_PARTIAL_420" || photoMetricInterpretation === "YBR_RCT" || photoMetricInterpretation === "YBR_ICT";
}

// ../../../INGENI~1/AppData/Local/Temp/opencode/cs3/node_modules/@cornerstonejs/dicom-image-loader/dist/esm/decodeImageFrameWorker.js
var imageUtils = {
  bilinear,
  replicate
};
var typedArrayConstructors = {
  Uint8Array,
  Uint16Array,
  Int16Array,
  Float32Array,
  Uint32Array
};
function postProcessDecodedPixels(imageFrame, options, start, decodeConfig) {
  const shouldShift = imageFrame.pixelRepresentation !== void 0 && imageFrame.pixelRepresentation === 1;
  const shift = shouldShift && imageFrame.bitsStored !== void 0 ? 32 - imageFrame.bitsStored : void 0;
  if (shouldShift && shift !== void 0) {
    for (let i = 0; i < imageFrame.pixelData.length; i++) {
      imageFrame.pixelData[i] = imageFrame.pixelData[i] << shift >> shift;
    }
  }
  let pixelDataArray = imageFrame.pixelData;
  imageFrame.pixelDataLength = imageFrame.pixelData.length;
  const { min: minBeforeScale, max: maxBeforeScale } = getMinMax_default(imageFrame.pixelData);
  const canRenderFloat = typeof options.allowFloatRendering !== "undefined" ? options.allowFloatRendering : true;
  let invalidType = isColorImage_default(imageFrame.photometricInterpretation) && options.targetBuffer?.offset === void 0;
  const willScale = options.preScale?.enabled;
  const hasFloatRescale = willScale && Object.values(options.preScale.scalingParameters).some((v) => typeof v === "number" && !Number.isInteger(v));
  const disableScale = !options.preScale.enabled || !canRenderFloat && hasFloatRescale;
  const type = options.targetBuffer?.type;
  if (type && options.preScale.enabled && !disableScale) {
    const scalingParameters = options.preScale.scalingParameters;
    const scaledValues = _calculateScaledMinMax(minBeforeScale, maxBeforeScale, scalingParameters);
    invalidType = !validatePixelDataType(scaledValues.min, scaledValues.max, typedArrayConstructors[type]);
  }
  if (type && !invalidType) {
    pixelDataArray = _handleTargetBuffer(options, imageFrame, typedArrayConstructors, pixelDataArray);
  } else if (options.preScale.enabled && !disableScale) {
    pixelDataArray = _handlePreScaleSetup(options, minBeforeScale, maxBeforeScale, imageFrame);
  } else {
    pixelDataArray = _getDefaultPixelDataArray(minBeforeScale, maxBeforeScale, imageFrame);
  }
  let minAfterScale = minBeforeScale;
  let maxAfterScale = maxBeforeScale;
  if (options.preScale.enabled && !disableScale) {
    const scalingParameters = options.preScale.scalingParameters;
    _validateScalingParameters(scalingParameters);
    const isRequiredScaling = _isRequiredScaling(scalingParameters);
    if (isRequiredScaling) {
      scaleArray(pixelDataArray, scalingParameters);
      imageFrame.preScale = {
        ...options.preScale,
        scaled: true
      };
      const scaledValues = _calculateScaledMinMax(minBeforeScale, maxBeforeScale, scalingParameters);
      minAfterScale = scaledValues.min;
      maxAfterScale = scaledValues.max;
    }
  } else if (disableScale) {
    minAfterScale = minBeforeScale;
    maxAfterScale = maxBeforeScale;
  }
  imageFrame.pixelData = pixelDataArray;
  imageFrame.smallestPixelValue = minAfterScale;
  imageFrame.largestPixelValue = maxAfterScale;
  const end = (/* @__PURE__ */ new Date()).getTime();
  imageFrame.decodeTimeInMS = end - start;
  return imageFrame;
}
function _isRequiredScaling(scalingParameters) {
  const { rescaleSlope, rescaleIntercept, modality, doseGridScaling, suvbw } = scalingParameters;
  const hasRescaleValues = typeof rescaleSlope === "number" && typeof rescaleIntercept === "number";
  const isRTDOSEWithScaling = modality === "RTDOSE" && typeof doseGridScaling === "number";
  const isPTWithSUV = modality === "PT" && typeof suvbw === "number";
  return hasRescaleValues || isRTDOSEWithScaling || isPTWithSUV;
}
function _handleTargetBuffer(options, imageFrame, typedArrayConstructors2, pixelDataArray) {
  const { arrayBuffer, type, offset: rawOffset = 0, length: rawLength, rows } = options.targetBuffer;
  const TypedArrayConstructor = typedArrayConstructors2[type];
  if (!TypedArrayConstructor) {
    throw new Error(`target array ${type} is not supported, or doesn't exist.`);
  }
  if (rows && rows != imageFrame.rows) {
    scaleImageFrame(imageFrame, options.targetBuffer, TypedArrayConstructor);
  }
  const imageFrameLength = imageFrame.pixelDataLength;
  const offset = rawOffset;
  const length = rawLength !== null && rawLength !== void 0 ? rawLength : imageFrameLength - offset;
  const imageFramePixelData = imageFrame.pixelData;
  if (length !== imageFramePixelData.length) {
    throw new Error(`target array for image does not have the same length (${length}) as the decoded image length (${imageFramePixelData.length}).`);
  }
  const typedArray = arrayBuffer ? new TypedArrayConstructor(arrayBuffer, offset, length) : new TypedArrayConstructor(length);
  typedArray.set(imageFramePixelData, 0);
  pixelDataArray = typedArray;
  return pixelDataArray;
}
function _handlePreScaleSetup(options, minBeforeScale, maxBeforeScale, imageFrame) {
  const scalingParameters = options.preScale.scalingParameters;
  _validateScalingParameters(scalingParameters);
  const scaledValues = _calculateScaledMinMax(minBeforeScale, maxBeforeScale, scalingParameters);
  return _getDefaultPixelDataArray(scaledValues.min, scaledValues.max, imageFrame);
}
function _getDefaultPixelDataArray(min, max, imageFrame) {
  const TypedArrayConstructor = getPixelDataTypeFromMinMax(min, max);
  const typedArray = new TypedArrayConstructor(imageFrame.pixelData.length);
  typedArray.set(imageFrame.pixelData, 0);
  return typedArray;
}
function _calculateScaledMinMax(minValue, maxValue, scalingParameters) {
  const { rescaleSlope, rescaleIntercept, modality, doseGridScaling, suvbw } = scalingParameters;
  if (modality === "PT" && typeof suvbw === "number" && !isNaN(suvbw)) {
    return {
      min: suvbw * (minValue * rescaleSlope + rescaleIntercept),
      max: suvbw * (maxValue * rescaleSlope + rescaleIntercept)
    };
  } else if (modality === "RTDOSE" && typeof doseGridScaling === "number" && !isNaN(doseGridScaling)) {
    return {
      min: minValue * doseGridScaling,
      max: maxValue * doseGridScaling
    };
  } else if (typeof rescaleSlope === "number" && typeof rescaleIntercept === "number") {
    return {
      min: rescaleSlope * minValue + rescaleIntercept,
      max: rescaleSlope * maxValue + rescaleIntercept
    };
  } else {
    return {
      min: minValue,
      max: maxValue
    };
  }
}
function _validateScalingParameters(scalingParameters) {
  if (!scalingParameters) {
    throw new Error("options.preScale.scalingParameters must be defined if preScale.enabled is true, and scalingParameters cannot be derived from the metadata providers.");
  }
}
function createDestinationImage(imageFrame, targetBuffer, TypedArrayConstructor) {
  const { samplesPerPixel } = imageFrame;
  const { rows, columns } = targetBuffer;
  const typedLength = rows * columns * samplesPerPixel;
  const pixelData = new TypedArrayConstructor(typedLength);
  const bytesPerPixel = pixelData.byteLength / typedLength;
  return {
    pixelData,
    rows,
    columns,
    frameInfo: {
      ...imageFrame.frameInfo,
      rows,
      columns
    },
    imageInfo: {
      ...imageFrame.imageInfo,
      rows,
      columns,
      bytesPerPixel
    }
  };
}
function scaleImageFrame(imageFrame, targetBuffer, TypedArrayConstructor) {
  const dest = createDestinationImage(imageFrame, targetBuffer, TypedArrayConstructor);
  const { scalingType = "replicate" } = targetBuffer;
  imageUtils[scalingType](imageFrame, dest);
  Object.assign(imageFrame, dest);
  imageFrame.pixelDataLength = imageFrame.pixelData.length;
  return imageFrame;
}
async function decodeImageFrame(imageFrame, transferSyntax, pixelData, decodeConfig, options, callbackFn) {
  const start = (/* @__PURE__ */ new Date()).getTime();
  setWasmBasePathFromConfig(decodeConfig);
  let decodePromise = null;
  let opts;
  switch (transferSyntax) {
    case "1.2.840.10008.1.2":
    case "1.2.840.10008.1.2.1":
      decodePromise = decodeLittleEndian_default(imageFrame, pixelData);
      break;
    case "1.2.840.10008.1.2.2":
      decodePromise = decodeBigEndian_default(imageFrame, pixelData);
      break;
    case "1.2.840.10008.1.2.1.99":
      decodePromise = decodeLittleEndian_default(imageFrame, pixelData);
      break;
    case "1.2.840.10008.1.2.5":
      decodePromise = decodeRLE_default(imageFrame, pixelData);
      break;
    case "1.2.840.10008.1.2.4.50":
      opts = {
        ...imageFrame
      };
      decodePromise = decodeJPEGBaseline8Bit_default(pixelData, opts);
      break;
    case "1.2.840.10008.1.2.4.51":
      decodePromise = decodeJPEGBaseline12Bit_js_default(imageFrame, pixelData);
      break;
    case "1.2.840.10008.1.2.4.57":
      decodePromise = decodeJPEGLossless_default(imageFrame, pixelData);
      break;
    case "1.2.840.10008.1.2.4.70":
      decodePromise = decodeJPEGLossless_default(imageFrame, pixelData);
      break;
    case "1.2.840.10008.1.2.4.80":
      opts = {
        signed: imageFrame.pixelRepresentation === 1,
        bytesPerPixel: imageFrame.bitsAllocated <= 8 ? 1 : 2,
        ...imageFrame
      };
      decodePromise = decodeJPEGLS_default(pixelData, opts);
      break;
    case "1.2.840.10008.1.2.4.81":
      opts = {
        signed: imageFrame.pixelRepresentation === 1,
        bytesPerPixel: imageFrame.bitsAllocated <= 8 ? 1 : 2,
        ...imageFrame
      };
      decodePromise = decodeJPEGLS_default(pixelData, opts);
      break;
    case "1.2.840.10008.1.2.4.90":
      opts = {
        ...imageFrame
      };
      decodePromise = decodeJPEG2000_default(pixelData, opts);
      break;
    case "1.2.840.10008.1.2.4.91":
      opts = {
        ...imageFrame
      };
      decodePromise = decodeJPEG2000_default(pixelData, opts);
      break;
    case "3.2.840.10008.1.2.4.96":
    case "1.2.840.10008.1.2.4.201":
    case "1.2.840.10008.1.2.4.202":
    case "1.2.840.10008.1.2.4.203":
      opts = {
        ...imageFrame
      };
      decodePromise = decodeHTJ2K_default(pixelData, opts);
      break;
    default:
      throw new Error(`no decoder for transfer syntax ${transferSyntax}`);
  }
  if (!decodePromise) {
    throw new Error("decodePromise not defined");
  }
  const decodedFrame = await decodePromise;
  const postProcessed = postProcessDecodedPixels(decodedFrame, options, start, decodeConfig);
  callbackFn?.(postProcessed);
  return postProcessed;
}
var obj = {
  decodeTask({ imageFrame, transferSyntax, decodeConfig, options, pixelData, callbackFn }) {
    return decodeImageFrame(imageFrame, transferSyntax, pixelData, decodeConfig, options, callbackFn);
  }
};
var workerEndpoint = typeof self !== "undefined" && typeof self.addEventListener === "function" && typeof self.postMessage === "function" && typeof self.document === "undefined" ? self : void 0;
if (workerEndpoint) {
  expose(obj, workerEndpoint);
}
export {
  decodeImageFrame,
  postProcessDecodedPixels
};
/*! Bundled license information:

comlink/dist/esm/comlink.mjs:
  (**
   * @license
   * Copyright 2019 Google LLC
   * SPDX-License-Identifier: Apache-2.0
   *)
*/


var googleId = 6353;  //0x18d1
var twinkieId = 20490; //0x500a
var DEVICE_INFO = {"vendorId": googleId, "productId": twinkieId};
var requestButton = document.getElementById("requestPermission");
var captureButton = document.getElementById("capture");
var adcButton = document.getElementById("adc");
var cc1State = document.getElementById("cc1");
var cc2State = document.getElementById("cc2");

var capSize = 10000;
var ccEdges = 2000;
var capBuf = new Uint8Array(capSize);
var capInsert = 0;
var respCb = null;
var respN = 0;
var chOut;
var chIn;
var chCap;

var conInTransInfo = { "direction": "in", "endpoint": 1, "length": 64 };
var capInTransInfo = { "direction": "in", "endpoint": 3, "length": 64 };

var dec5b = new Array(
/* Error    */ 0x10 /* 00000 */,
/* Error    */ 0x10 /* 00001 */,
/* Error    */ 0x10 /* 00010 */,
/* Error    */ 0x10 /* 00011 */,
/* Error    */ 0x10 /* 00100 */,
/* Error    */ 0x10 /* 00101 */,
/* Error    */ 0x10 /* 00110 */,
/* RST-1    */ 0x13 /* 00111 K-code: Hard Reset #1 */,
/* Error    */ 0x10 /* 01000 */,
/* 1 = 0001 */ 0x01 /* 01001 */,
/* 4 = 0100 */ 0x04 /* 01010 */,
/* 5 = 0101 */ 0x05 /* 01011 */,
/* Error    */ 0x10 /* 01100 */,
/* EOP      */ 0x15 /* 01101 K-code: EOP End Of Packet */,
/* 6 = 0110 */ 0x06 /* 01110 */,
/* 7 = 0111 */ 0x07 /* 01111 */,
/* Error    */ 0x10 /* 10000 */,
/* Sync-2   */ 0x12 /* 10001 K-code: Startsynch #2 */,
/* 8 = 1000 */ 0x08 /* 10010 */,
/* 9 = 1001 */ 0x09 /* 10011 */,
/* 2 = 0010 */ 0x02 /* 10100 */,
/* 3 = 0011 */ 0x03 /* 10101 */,
/* A = 1010 */ 0x0A /* 10110 */,
/* B = 1011 */ 0x0B /* 10111 */,
/* Sync-1   */ 0x11 /* 11000 K-code: Startsynch #1 */,
/* RST-2    */ 0x14 /* 11001 K-code: Hard Reset #2 */,
/* C = 1100 */ 0x0C /* 11010 */,
/* D = 1101 */ 0x0D /* 11011 */,
/* E = 1110 */ 0x0E /* 11100 */,
/* F = 1111 */ 0x0F /* 11101 */,
/* 0 = 0000 */ 0x00 /* 11110 */,
/* Error    */ 0x10 /* 11111 */);

var dec5str = new Array(
"Error" /* 00000 */,
"Error" /* 00001 */,
"Error" /* 00010 */,
"Error" /* 00011 */,
"Error" /* 00100 */,
"Error" /* 00101 */,
"Error" /* 00110 */,
"RST-1" /* 00111 K-code: Hard Reset #1 */,
"Error" /* 01000 */,
"Dat-1" /* 01001 */,
"Dat-4" /* 01010 */,
"Dat-5" /* 01011 */,
"Error" /* 01100 */,
"EOP--" /* 01101 K-code: EOP End Of Packet */,
"Dat-6" /* 01110 */,
"Dat-7" /* 01111 */,
"Error" /* 10000 */,
"Syn-2" /* 10001 K-code: Startsynch #2 */,
"Dat-8" /* 10010 */,
"Dat-9" /* 10011 */,
"Dat-2" /* 10100 */,
"Dat-3" /* 10101 */,
"Dat-A" /* 10110 */,
"Dat-B" /* 10111 */,
"Syn-1" /* 11000 K-code: Startsynch #1 */,
"RST-2" /* 11001 K-code: Hard Reset #2 */,
"Dat-C" /* 11010 */,
"Dat-D" /* 11011 */,
"Dat-E" /* 11100 */,
"Dat-F" /* 11101 */,
"Dat-0" /* 11110 */,
"Error" /* 11111 */);

function keyToTw(event) {
  console.log("Send " + event.charCode);
  var a = new ArrayBuffer(1);
  var int8View = new Int8Array(a);
  if (event.charCode == 13) {
    int8View[0] = 10;
  } else {
    int8View[0] = event.charCode;
  }
  var transInfo = { "direction": "out", "endpoint": 1, "data": a };

  chrome.usb.bulkTransfer(chOut, transInfo, function() {
    console.log("Out done");
  });
}

function cmdToTw(cmd, nval, cb) {
  console.log("Send command " + cmd);
  var tosend = cmd.length + 1;
  var sp = 0;
//  while (tosend > 0) {
    var sblksize = (tosend > 7) ? 7 : tosend;
    var a = new ArrayBuffer(sblksize);
    var cbuf = new Int8Array(a);
    for (i=0; i<(sblksize-1); i++) cbuf[i] = cmd.charCodeAt(sp++) & 0xFF;
    cbuf[sblksize-1] = (sp == cmd.length) ? 10 : cmd.charCodeAt(sp++) & 0xFF;
    var transInfo = { "direction": "out", "endpoint": 1, "data": a };
    respCb = cb;
    respN = nval;
    chrome.usb.bulkTransfer(chOut, transInfo, function() {
      console.log("Cmd Out done");
      tosend -= sblksize;
      if (tosend > 0) setTimeout(function(){cmdToTw(cmd.substr(1-tosend), nval, cb);}, 100);
    });
//    tosend -= sblksize;
//  }
}

var capCC = 0;
var capLast = new Array(0,0,0,0);
var capPad = new Array(0,0,0,0);
// buffer zone of 64 edges in worst case
var capDelta = new Array(new Uint32Array(ccEdges+64), new Uint32Array(ccEdges+64));
var capPos = new Array(0,0,0,0);


function postProcess_old() {
    var ccdump = new Array("", "", "", "");
    var ccfake = new Array("", "", "", "");
    var flip = new Array("<tr>", "<tr>", "", "");
    var fou = new Array("<tr>", "<tr>", "", "");
    var ddat = new Array("<tr>", "<tr>", "", "");
    var twidth = new Array(0,0,0,0);

    // TODO: Eventually remove the raw info
    var dumpsize = (capInsert > capSize) ? capSize : capInsert;
    var lastTime = 0;
    var dump = "";

    for (i=0; i < dumpsize; i++) {
      if ((i & 63) == 0) {
        var sampleTime = (capBuf[i+3]<<8) + capBuf[i+2];
        var timeDiff = (i==0) ? 0 : sampleTime - lastTime;
        var seqf = (capBuf[i+1]<<8) + capBuf[i];
        var cc = (seqf >> 12) & 0x3;
        var seq = seqf & 0xfff;
        var ofw = (seqf & 0x8000) ? "*" : " ";
        lastTime = sampleTime;
        dump += "<br/>CC" + (cc+1) + " " + ofw + seq + " " + seqf.toString(16);
        //i += 3;
      } else {
        if (capBuf[i] < 16)
          dump += " 0" + capBuf[i].toString(16);
        else
          dump += " " + capBuf[i].toString(16);
      }
    }
    for(var cc=0; cc < 2; cc++) {
      var bits = 0;
      var bitcount = 0;
      var inpacket = false;
      var half1 = false;
      var ndec = 1;
      var nfou = 1;
      for (i = 0; i < capPos[cc]; i++) {
        //Clock is 2.4MHz so one tick is 417ns
        //Encoded zero is one 300kHZ sample wide or 3333ns (8 samples)
        //Encoded one has edge in middle so 1667,1667 (4,4 samples)
        //DRP toggle min 30% of 50ms (35971 samples)
        //DRP toggle max 70% of 100ms (167866 samples)
        var delta = capDelta[cc][i];
        var found = "???";
        var decdata = ".....";
        if (delta > 35971) {
          if (delta < 167866) found="DRP";
          bits=0;
          bitcount=0;
          inpacket=false;
        }
        if ((delta > 6) && (delta < 10)) {
          found="EN0";
          bits = bits>>1;
          bitcount++;
        }
        if ((delta > 2) && (delta < 6)) {
          if (half1) {
            found = "EN1";
            half1 = false;
            bits = 16 + (bits>>1);
            bitcount++;
          } else {
            found = "...";
            half1 = true;
          }
        } else half1 = false;
        if (!half1) {
          if (inpacket) {
            if (bitcount >= 5)
            {
              decdata = dec5str[bits];
              bitcount=0;
              if (decdata == "EOP--") inpacket=false;
            }
          } else {
            if (dec5b[bits] == 0x11) {
              decdata = dec5str[bits];
              bitcount = 0;
              inpacket = true;
              ddat[cc] += "<td colspan=" + (ndec-7) + "></td>";
              ndec=7;
            }
          }
        }
        //ccdump[cc] += decdata + (inpacket ? "." : " ") + found + " +" + delta + " " + bits.toString(2) + "<BR>";
        if (delta < 200) {
          flip[cc] += "<td width=" + (delta*3) + "px></td>";
          twidth[cc] += (delta*3)+1;
        } else {
          flip[cc] += "<td width=300px>.." + delta + "..</td>";
          twidth[cc] += 301;
        }
        if (found != "...") {
          fou[cc] += "<td colspan=" + nfou + ">" + found + "</td>";
          nfou = 1;
        } else {
          nfou++;
        }
        if (decdata != ".....") {
          ddat[cc] += "<td colspan=" + ndec +
                      (inpacket ? " bgcolor=green>":">") + decdata + "</td>";
          ndec = 1;
        } else {
          ndec++;
        }
        ccfake[cc] += delta + ",";
        if ((i & 7) == 7) ccfake[cc] += "<BR>&nbsp;&nbsp;";
      }
    }
    document.getElementById("capturedump").innerHTML = dump +
      //"<BR><B>CC1</B><BR>" + ccdump[0] + "<BR><B>CC2</B><BR>" + ccdump[1] +
      "<BR><B>CC1</B><table border width=" + twidth[0] + ">" +
      flip[0] + "</tr>" +
      fou[0] + "</tr>" +
      ddat[0] + "</tr></table>" +
      "<BR><B>CC2</B><table border width=" + twidth[1] + ">" +
      flip[1] + "</tr>" +
      fou[1] + "</tr>" +
      ddat[1] + "</tr></table>" +
      "<BR>ccfake[0]<br>&nbsp;&nbsp;" + ccfake[0] +
      "<BR>ccfake[1]<br>&nbsp;&nbsp;" + ccfake[1];

}

function decpkt(p, len) {
  var pp = "";
  for(var i=0; i < len; i++) pp += p[i].toString(16) + " ";
  return pp;
}

function postProcess() {
    var ccdump = new Array("", "", "", "");
    var ccfake = new Array("", "", "", "");
    var dump = "";
    var packet = new Uint8Array(64);
    var pktoff = 0;

    for(var cc=0; cc < 2; cc++) {
      var flip = "<tr>";
      var fou = "<tr>";
      var ddat = "<tr>";
      var dpkt = "<tr>";
      var twidth = 0;

      var bits = 0;
      var bitcount = 0;
      var inpacket = false;
      var indrp = false;
      var half1 = false;
      var ndec = 1;
      var nfou = 1;
      var npkt = 1;

      var nextnew = false;
      dump += "<BR><B>CC" + (cc+1) + "</B><BR>"
      for (var i = 0; i < capPos[cc]; i++) {
        //Clock is 2.4MHz so one tick is 417ns
        //Encoded zero is one 300kHZ sample wide or 3333ns (8 samples)
        //Encoded one has edge in middle so 1667,1667 (4,4 samples)
        //DRP toggle min 30% of 50ms (35971 samples)
        //DRP toggle max 70% of 100ms (167866 samples)
        var delta = capDelta[cc][i];
        var found = "???";
        var decdata = ".....";
        var newsect = nextnew;
        nextnew = false;

        if (delta > 35971) {
          if (delta < 167866) {
            found="DRP";
            if (!indrp) {indrp = true; newsect = true; }
          }
          bits=0;
          bitcount=0;
          if (inpacket) {inpacket=false; newsect = true; }
        }
        if ((delta > 6) && (delta < 10)) {
          found="EN0";
          bits = bits>>1;
          bitcount++;
          if (indrp) {indrp = false; newsect = true; }
        }
        if ((delta > 2) && (delta < 6)) {
          if (indrp) {indrp = false; newsect = true; }
          if (half1) {
            found = "EN1";
            half1 = false;
            bits = 16 + (bits>>1);
            bitcount++;
          } else {
            found = "...";
            half1 = true;
          }
        } else half1 = false;
        if (!half1) {
          if (inpacket) {
            if (bitcount >= 5)
            {
              decdata = dec5str[bits];
              packet[pktoff++] = dec5b[bits];
              bitcount=0;
            }
          } else {
            if (dec5b[bits] == 0x11) {
              decdata = dec5str[bits];
              packet[0] = 0x11;
              pktoff = 1;
              npkt = 1;
              bitcount = 0;
              inpacket = true;
              ddat += "<td colspan=" + (ndec-7) + "></td>";
              dpkt += "<td colspan=" + (ndec-7) + "></td>";
              ndec=7;
            }
          }
        }
        if (newsect || (i == (capPos[cc] - 1))) {
          dump += "<table border width=" + twidth + ">" +
                  flip + "</tr>" +
                  fou + "</tr>" +
                  ddat + "</tr>" +
                  dpkt + "</tr>" +
                  "</table><p></p>";
          flip = "<tr>";
          fou = "<tr>";
          ddat = "<tr>";
          dpkt = "<tr>";
          twidth = 0;
          nfou = 1;
          ndec = 1;
        }
        if (delta < 200) {
          flip += "<td width=" + (delta*3) + "px></td>";
          twidth += (delta*3)+1;
        } else {
          flip += "<td width=300px>.." + delta + "..</td>";
          twidth += 301;
        }
        if (found != "...") {
          fou += "<td colspan=" + nfou + ">" + found + "</td>";
          nfou = 1;
        } else {
          nfou++;
        }
        if (decdata != ".....") {
          ddat += "<td colspan=" + ndec +
                      (inpacket ? " bgcolor=green>":">") + decdata + "</td>";
          npkt += ndec;
          ndec = 1;
          if (decdata == "EOP--") {
            inpacket=false;
            nextnew = true;
            dpkt += "<td colspan=" + npkt + ">" + decpkt(packet, pktoff) + "</td>";
          }
        } else {
          ndec++;
        }
        ccfake[cc] += delta + ",";
        if ((i & 7) == 7) ccfake[cc] += "<BR>&nbsp;&nbsp;";
      }
    }
    document.getElementById("capturedump").innerHTML = dump +
      "<BR>ccfake[0]<br>&nbsp;&nbsp;" + ccfake[0] +
      "<BR>ccfake[1]<br>&nbsp;&nbsp;" + ccfake[1];

}



function onCapIn(info) {
  if (info.resultCode != 0) {
      console.log("onCapIn: result code "+info.resultCode);
      console.log(chrome.runtime.lastError);
      if (info.resultCode != 6) return;
  } else {
    //console.log("onCapIn: length " + info.data.byteLength);
    var intView = new Uint8Array(info.data)
    for(i=0; i < info.data.byteLength; i++) {
      var dat = intView[i];
      if ((capInsert & 63) == 1) capCC = (dat>>4) & 3;
      if ((capInsert & 63) > 3) {
        if (dat == capLast[capCC]) {
          capPad[capCC]++;
        } else {
          var pad = 256 * capPad[capCC];
          // Get one extra sample when it hits 0xff, so capPad will be 1
          // So no need to compensate when dat < capLast[capCC]
          // because capPad will equal 1
          // seen a case of 235, 239, 248, 0
          if ((pad == 0) && (dat < capLast[capCC])) pad = 256;
          if (capCC < 2)
            capDelta[capCC][capPos[capCC]++] = pad + dat - capLast[capCC];
          if (capDelta[capCC][capPos[capCC]-1] > 500000)
            console.log("CHECK" + capCC + " " + pad + "+" + dat + "-" + capLast[capCC] + " capPad=" + capPad[capCC] + " " + i + "d" + intView[i-3] +" "+ intView[i-2] +" "+ intView[i-1]);
          capLast[capCC] = dat;
          capPad[capCC] = 0;
        }
      }
      // TODO: No need to do raw capture but keep for now
      if (capInsert < capSize) capBuf[capInsert] = dat;
      capInsert++;
    }
  }
  //if (capInsert < (capSize - 64)) {
  if ((capPos[0] < ccEdges) && (capPos[1] < ccEdges)) {
    chrome.usb.bulkTransfer(chCap, capInTransInfo, onCapIn);
    return;
  } else {
    chrome.usb.releaseInterface(chCap, 3, function() {
      console.log("Released interface 3");
    });
    postProcess();
  }
}

var capResp = 0;
var respBuf = "";
var onNL = 0;

function onConIn(info) {
  var decodedString = "";
  if (info.resultCode != 0) {
      console.log("onConIn: result code "+info.resultCode);
      console.log(chrome.runtime.lastError);
      if (info.resultCode != 6) return;
      decodedString = "<br/>";
  } else {
    console.log("onConIn: length " + info.data.byteLength);
    var intView = new Int8Array(info.data)
    for(i=0; i < info.data.byteLength; i++) {
      if (intView[i] == 10) {
          decodedString += "<br/>";
          onNL = 1;
      } else {
        var decodedChar = String.fromCharCode(intView[i]);
        decodedString += decodedChar;
        if (onNL) {
          if (decodedChar == ">") {
            if (respCb == null) {
              console.log("Response " + respBuf);
            } else {
              // callback might set a new respCb...
              var tocall = respCb;
              respCb = null;
              //console.log("Callback " + respBuf);
              tocall(respBuf, respN);
            }
            respBuf = "";
            capResp = 0;
          } else {
            capResp = 1;
          }
          onNL = 0;
        }
        if (capResp) respBuf += decodedChar;
      }
    }
  }
  console.log("String " + decodedString);
  var conOut = document.getElementById("outarea");
  conOut.insertAdjacentHTML("beforeEnd", decodedString);
  conOut.scrollTop = conOut.scrollHeight;
  chrome.usb.bulkTransfer(chIn, conInTransInfo, onConIn);
}

function startTwConIn(chandle) {
  chrome.usb.claimInterface(chandle, 1, function() {
    console.log("Claimed interface 1");
    chIn = chandle;
    chrome.usb.bulkTransfer(chIn, conInTransInfo, onConIn);
    chOut = chandle;
    window.onkeypress = keyToTw;
  });
//  chrome.usb.claimInterface(chandle, 2, function() {
//    console.log("Claimed interface 2");
//    chOut = chandle;
//    window.onkeypress = keyToTw;
//  });
}

function onOpenTw(chandle) {
  console.log("Opened:" + chandle);
  console.log(chrome.runtime.lastError);
  chrome.usb.listInterfaces(chandle, function(ides) {
    console.log("Interfaces"+ides);
  });
}

function onFound(chandles) {
  this.chandles=chandles;
  if (chandles) {
    if (chandles.length > 0) {
      console.log("chandle(s) found: "+chandles.length);
      console.log("dev0:" + chandles[0]);
      chrome.usb.listInterfaces(chandles[0], function(ides) {
        console.log("Interfaces"+ides);
      });
      startTwConIn(chandles[0]);
      chOut = chandles[0];
      chCap = chandles[0];
    } else {
      console.log("zero found");
    }
  } else {
    console.log("Permission denied.");
  }
}
function onDeviceFound(devices) {
  this.devices=devices;
  if (devices) {
    if (devices.length > 0) {
      console.log("Device(s) found: "+devices.length);
      console.log("dev0:" + devices[0]);
      chrome.usb.openDevice(devices[0], onOpenTw);
    } else {
      console.log("Device could not be found");
    }
  } else {
    console.log("Permission denied.");
  }
}

var permissionObj = {permissions: [{'usbDevices': [DEVICE_INFO] }]};

captureButton.addEventListener('click', function() {
  capInsert = 0;
  capPos[0] = capPos[1] = capPos[2] = capPos[3] = 0;
  chrome.usb.claimInterface(chCap, 3, function() {
    console.log("Claimed interface 3");
    chrome.usb.bulkTransfer(chCap, capInTransInfo, onCapIn);
  });
});


//window.onload = function() {

requestButton.addEventListener('click', function() {
//  chrome.permissions.contains( permissionObj, function(result) {
//    if (result) {
      chrome.usb.findDevices({"vendorId": googleId, "productId": twinkieId}, onFound);
//    } else {
//      console.log('App was not granted the "usbDevices" permission.');
//      console.log(chrome.runtime.lastError);
//    }
//  });
  requestButton.innerText="Connected";
});


function ccAdcToRval(adcRes) {
  var mV = adcRes.replace(/.*= /, "");
  console.log("In mV cc is " + mV);
  if (mV > 2100) return "DFP NC";
  if (mV > 1230) return "vRd-3.0";
  if (mV > 0660) return "vRd-1.5";
  if (mV > 0200) return "vRd-USB";
  return "vRa / UFP NC";
}

adcButton.addEventListener('click', function() {
  cmdToTw("adc CC1_PD", 0, function(res, n) {
    cc1State.innerHTML = ccAdcToRval(res);
    cmdToTw("adc CC2_PD", 0, function(res1, n) {
        cc2State.innerHTML = ccAdcToRval(res1);
    });
  });
});

var rd1Button = document.getElementById("rd1");

rd1Button.addEventListener('click', function() {
  console.log("Got rd1 state is " + rd1Button.checked);
  if (rd1Button.checked)
    cmdToTw("gpioset CC1_RD 0", 0, function(){});
  else
    cmdToTw("gpioset CC1_RD 1", 0, function(){});
});

var rd2Button = document.getElementById("rd2");

rd2Button.addEventListener('click', function() {
  console.log("Got rd2 state is " + rd2Button.checked);
  if (rd2Button.checked)
    cmdToTw("gpioset CC2_RD 0", 0, function(){});
  else
    cmdToTw("gpioset CC2_RD 1", 0, function(){});
});

var foundn;
function rp1loop(res, n) {
  if (n == 1) foundn = 0;
  if (n > 3) {
    if (foundn) cmdToTw("gpioset " + foundn + " 1", n, function(){});
    return;
  }
  var radio = document.getElementById("rp1-" + n);
  if (radio.checked) {
    console.log("Got Rp1 checked for " + radio.value);
    foundn = radio.value;
    rp1loop("", n+1);
  } else
    cmdToTw("gpioset " + radio.value + " 0", n+1, rp1loop);
}

function rp1() {
  rp1loop("", 1);
}
document.getElementById("rp1-0").onchange = rp1;
document.getElementById("rp1-1").onchange = rp1;
document.getElementById("rp1-2").onchange = rp1;
document.getElementById("rp1-3").onchange = rp1;

function rp2loop(res, n) {
  if (n == 1) foundn = 0;
  if (n > 3) {
    if (foundn) cmdToTw("gpioset " + foundn + " 1", n, function(){});
    return;
  }
  var radio = document.getElementById("rp2-" + n);
  if (radio.checked) {
    console.log("Got Rp2 checked for " + radio.value);
    foundn = radio.value;
    rp2loop("", n+1);
  } else
    cmdToTw("gpioset " + radio.value + " 0", n+1, rp2loop);
}

function rp2() {
  rp2loop("", 1);
}
document.getElementById("rp2-0").onchange = rp2;
document.getElementById("rp2-1").onchange = rp2;
document.getElementById("rp2-2").onchange = rp2;
document.getElementById("rp2-3").onchange = rp2;

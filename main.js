
var googleId = 6353;  //0x18d1
var twinkieId = 20490; //0x500a
var DEVICE_INFO = {"vendorId": googleId, "productId": twinkieId};
var requestButton = document.getElementById("requestPermission");
var captureButton = document.getElementById("capture");
var adcButton = document.getElementById("adc");
var cc1State = document.getElementById("cc1");
var cc2State = document.getElementById("cc2");

var capSize = 10000;
var ccEdges = 100;
var capBuf = new Uint8Array(capSize);
var capInsert = 0;
var respCb = null;
var chOut;
var chIn;
var chCap;

var conInTransInfo = { "direction": "in", "endpoint": 1, "length": 64 };
var capInTransInfo = { "direction": "in", "endpoint": 3, "length": 64 };


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

function cmdToTw(cmd, cb) {
  console.log("Send command " + cmd);
  var tosend = cmd.length + 1;
  var sp = 0;
  while (tosend > 0) {
    var sblksize = (tosend > 14) ? 14 : tosend;
    var a = new ArrayBuffer(sblksize);
    var cbuf = new Int8Array(a);
    for (i=0; i<(sblksize-1); i++) cbuf[i] = cmd.charCodeAt(sp++) & 0xFF;
    cbuf[sblksize-1] = (sp == cmd.length) ? 10 : cmd.charCodeAt(sp++) & 0xFF;
    var transInfo = { "direction": "out", "endpoint": 1, "data": a };
    respCb = cb;
    chrome.usb.bulkTransfer(chOut, transInfo, function() {
      console.log("Cmd Out done");
    });
    tosend -= sblksize;
  }
}

var capCC = 0;
var capLast = new Array(0,0,0,0);
var capPad = new Array(0,0,0,0);
// buffer zone of 64 edges in worst case
var capDelta = new Array(new Uint32Array(ccEdges+64), new Uint32Array(ccEdges+64));
var capPos = new Array(0,0,0,0);

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
          if ((dat < capLast[capCC]) || (dat == 0xff)) pad += 256;
          if (capCC < 2)
            capDelta[capCC][capPos[capCC]++] = pad + dat - capLast[capCC];
          capLast[capCC] = dat;
          capPad[capCC] = 0;
        }
      }
      if (capInsert < capSize) capBuf[capInsert] = dat;
      capInsert++;
    }
  }
  //if (capInsert < (capSize - 64)) {
  if ((capPos[0] < ccEdges) && (capPos[1] < ccEdges)) {
    chrome.usb.bulkTransfer(chCap, capInTransInfo, onCapIn);
    return;
  } else {
    var dump = "";
    var lastTime = 0;
    var cc = 0;
    var ccstate = new Array(0,0,0,0);
    var cctime = new Array(0,0,0,0);
    var cclastval = new Array(0,0,0,0);
    var ccpad = new Array(0,0,0,0);
    var ccdump = new Array("", "", "", "");
    var cmp = new Array(0,0,0,0);
    var dumpsize = (capInsert > capSize) ? capSize : capInsert;

    for (i=0; i < dumpsize; i++) {
      if ((i & 63) == 0) {
        var sampleTime = (capBuf[i+3]<<8) + capBuf[i+2];
        var timeDiff = (i==0) ? 0 : sampleTime - lastTime;
        var seqf = (capBuf[i+1]<<8) + capBuf[i];
        cc = (seqf >> 12) & 0x3;
        var seq = seqf & 0xfff;
        var ofw = (seqf & 0x8000) ? "*" : " ";
        lastTime = sampleTime;
        // dump += "<br/>CC" + (cc+1) + " " + sampleTime + " " + capBuf[i+1].toString(16) + " " + timeDiff;
        dump += "<br/>CC" + (cc+1) + " " + ofw + seq + " " + seqf.toString(16);
        //i += 3;
      } //else {
      if ((i & 63) > 3) {
        if (capBuf[i] == cclastval[cc]) {
          ccpad[cc]++;
        } else {
          var pad = 256 * ccpad[cc];
          if ((capBuf[i] < cclastval[cc]) || (capBuf[i] == 0xff)) pad += 256;
          var deltat = pad + capBuf[i] - cclastval[cc];
          cctime[cc] += deltat;
          cclastval[cc] = capBuf[i];
          ccpad[cc] = 0;
          ccstate[cc] = ccstate[cc] ^ 1;
          ccdump[cc] += ccstate[cc] + " +" + deltat + " " + capDelta[cc][cmp[cc]++] + " " + cctime[cc] + "<br>";
          dump += ccstate[cc] + " +" + deltat + " ";
        }
      }
        if (capBuf[i] < 16)
          dump += " 0" + capBuf[i].toString(16);
        else
          dump += " " + capBuf[i].toString(16);
      //}
    }
    for(i=0; i < 2; i++) while (cmp[i] < capPos[i]) {
        ccdump[i] += ". +" + capDelta[i][cmp[i]++] + "<BR>";
    }
    document.getElementById("capturedump").innerHTML = dump + "<BR><B>CC1</B><BR>" + ccdump[0] + "<BR><B>CC2</B><BR>" + ccdump[1];
    chrome.usb.releaseInterface(chCap, 3, function() {
    console.log("Released interface 3");
  });
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
              tocall(respBuf);
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
  chrome.usb.bulkTransfer(chIn, conInTransInfo, onConIn);
}

function startTwConIn(chandle) {
  chrome.usb.claimInterface(chandle, 1, function() {
    console.log("Claimed interface 1");
    chIn = chandle;
    chrome.usb.bulkTransfer(chIn, conInTransInfo, onConIn);
  });
  chrome.usb.claimInterface(chandle, 2, function() {
    console.log("Claimed interface 2");
    chOut = chandle;
    window.onkeypress = keyToTw;
  });
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


  document.querySelector('#greeting').innerText =
    'Hello, World! It is ' + new Date();
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
  cmdToTw("adc CC1_PD", function(res) {
    cc1State.innerHTML = ccAdcToRval(res);
    cmdToTw("adc CC2_PD", function(res1) {
        cc2State.innerHTML = ccAdcToRval(res1);
    });
  });
});

var rd1Button = document.getElementById("rd1");

rd1Button.addEventListener('click', function() {
  console.log("Got rd1 state is " + rd1Button.checked);
  if (rd1Button.checked)
    cmdToTw("gpioset CC1_RD 0", function(){});
  else
    cmdToTw("gpioset CC1_RD 1", function(){});
});



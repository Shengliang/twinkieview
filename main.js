
var googleId = 6353;  //0x18d1
var twinkieId = 20490; //0x500a
var DEVICE_INFO = {"vendorId": googleId, "productId": twinkieId};
var requestButton = document.getElementById("requestPermission");
var captureButton = document.getElementById("capture");
var captureSize = 10000;
var capBuf = new Uint8Array(captureSize);
var capInsert = 0;

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
  var transInfo = { "direction": "out", "endpoint": 2, "data": a };

  chrome.usb.bulkTransfer(chOut, transInfo, function() {
    console.log("Out done");
  });
}

function onCapIn(info) {
  if (info.resultCode != 0) {
      console.log("onConIn: result code "+info.resultCode);
      console.log(chrome.runtime.lastError);
      if (info.resultCode != 6) return;
  } else {
    console.log("onConIn: length " + info.data.byteLength);
    var intView = new Uint8Array(info.data)
    for(i=0; i < info.data.byteLength; i++) {
      capBuf[capInsert++] = intView[i];
    }
  }
  if (capInsert < (captureSize - 64)) {
    chrome.usb.bulkTransfer(chCap, capInTransInfo, onCapIn);
  } else {
    var dump = "";
    var lastTime = 0;
    for (i=0; i < capInsert; i++) {
      if ((i & 63) == 0) {
        var sampleTime = (capBuf[i+3]<<8) + capBuf[i+2];
        var timeDiff = (i==0) ? 0 : sampleTime - lastTime;
        lastTime = sampleTime;
        dump += "<br/>" + sampleTime + " " + capBuf[i+1].toString(16) + " " + timeDiff;
        //i += 3;
      } //else {
        if (capBuf[i] < 16)
          dump += " 0" + capBuf[i].toString(16);
        else
          dump += " " + capBuf[i].toString(16);
      //}
    }
    document.getElementById("capturedump").innerHTML = dump;
    chrome.usb.releaseInterface(chCap, 3, function() {
    console.log("Released interface 3");
  });
  }
}

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
      } else {
        decodedString += String.fromCharCode(intView[i]);
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

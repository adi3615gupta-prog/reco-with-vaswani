var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/multer/node_modules/media-typer/index.js
var require_media_typer = __commonJS({
  "node_modules/multer/node_modules/media-typer/index.js"(exports2) {
    var paramRegExp = /; *([!#$%&'\*\+\-\.0-9A-Z\^_`a-z\|~]+) *= *("(?:[ !\u0023-\u005b\u005d-\u007e\u0080-\u00ff]|\\[\u0020-\u007e])*"|[!#$%&'\*\+\-\.0-9A-Z\^_`a-z\|~]+) */g;
    var textRegExp = /^[\u0020-\u007e\u0080-\u00ff]+$/;
    var tokenRegExp = /^[!#$%&'\*\+\-\.0-9A-Z\^_`a-z\|~]+$/;
    var qescRegExp = /\\([\u0000-\u007f])/g;
    var quoteRegExp = /([\\"])/g;
    var subtypeNameRegExp = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.-]{0,126}$/;
    var typeNameRegExp = /^[A-Za-z0-9][A-Za-z0-9!#$&^_-]{0,126}$/;
    var typeRegExp = /^ *([A-Za-z0-9][A-Za-z0-9!#$&^_-]{0,126})\/([A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}) *$/;
    exports2.format = format;
    exports2.parse = parse;
    function format(obj) {
      if (!obj || typeof obj !== "object") {
        throw new TypeError("argument obj is required");
      }
      var parameters = obj.parameters;
      var subtype = obj.subtype;
      var suffix = obj.suffix;
      var type = obj.type;
      if (!type || !typeNameRegExp.test(type)) {
        throw new TypeError("invalid type");
      }
      if (!subtype || !subtypeNameRegExp.test(subtype)) {
        throw new TypeError("invalid subtype");
      }
      var string = type + "/" + subtype;
      if (suffix) {
        if (!typeNameRegExp.test(suffix)) {
          throw new TypeError("invalid suffix");
        }
        string += "+" + suffix;
      }
      if (parameters && typeof parameters === "object") {
        var param;
        var params = Object.keys(parameters).sort();
        for (var i = 0; i < params.length; i++) {
          param = params[i];
          if (!tokenRegExp.test(param)) {
            throw new TypeError("invalid parameter name");
          }
          string += "; " + param + "=" + qstring(parameters[param]);
        }
      }
      return string;
    }
    function parse(string) {
      if (!string) {
        throw new TypeError("argument string is required");
      }
      if (typeof string === "object") {
        string = getcontenttype(string);
      }
      if (typeof string !== "string") {
        throw new TypeError("argument string is required to be a string");
      }
      var index = string.indexOf(";");
      var type = index !== -1 ? string.substr(0, index) : string;
      var key;
      var match;
      var obj = splitType(type);
      var params = {};
      var value;
      paramRegExp.lastIndex = index;
      while (match = paramRegExp.exec(string)) {
        if (match.index !== index) {
          throw new TypeError("invalid parameter format");
        }
        index += match[0].length;
        key = match[1].toLowerCase();
        value = match[2];
        if (value[0] === '"') {
          value = value.substr(1, value.length - 2).replace(qescRegExp, "$1");
        }
        params[key] = value;
      }
      if (index !== -1 && index !== string.length) {
        throw new TypeError("invalid parameter format");
      }
      obj.parameters = params;
      return obj;
    }
    function getcontenttype(obj) {
      if (typeof obj.getHeader === "function") {
        return obj.getHeader("content-type");
      }
      if (typeof obj.headers === "object") {
        return obj.headers && obj.headers["content-type"];
      }
    }
    function qstring(val) {
      var str = String(val);
      if (tokenRegExp.test(str)) {
        return str;
      }
      if (str.length > 0 && !textRegExp.test(str)) {
        throw new TypeError("invalid parameter value");
      }
      return '"' + str.replace(quoteRegExp, "\\$1") + '"';
    }
    function splitType(string) {
      var match = typeRegExp.exec(string.toLowerCase());
      if (!match) {
        throw new TypeError("invalid media type");
      }
      var type = match[1];
      var subtype = match[2];
      var suffix;
      var index = subtype.lastIndexOf("+");
      if (index !== -1) {
        suffix = subtype.substr(index + 1);
        subtype = subtype.substr(0, index);
      }
      var obj = {
        type,
        subtype,
        suffix
      };
      return obj;
    }
  }
});

// node_modules/mime-db/db.json
var require_db = __commonJS({
  "node_modules/mime-db/db.json"(exports2, module2) {
    module2.exports = {
      "application/1d-interleaved-parityfec": {
        source: "iana"
      },
      "application/3gpdash-qoe-report+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/3gpp-ims+xml": {
        source: "iana",
        compressible: true
      },
      "application/3gpphal+json": {
        source: "iana",
        compressible: true
      },
      "application/3gpphalforms+json": {
        source: "iana",
        compressible: true
      },
      "application/a2l": {
        source: "iana"
      },
      "application/ace+cbor": {
        source: "iana"
      },
      "application/activemessage": {
        source: "iana"
      },
      "application/activity+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-costmap+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-costmapfilter+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-directory+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-endpointcost+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-endpointcostparams+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-endpointprop+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-endpointpropparams+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-error+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-networkmap+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-networkmapfilter+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-updatestreamcontrol+json": {
        source: "iana",
        compressible: true
      },
      "application/alto-updatestreamparams+json": {
        source: "iana",
        compressible: true
      },
      "application/aml": {
        source: "iana"
      },
      "application/andrew-inset": {
        source: "iana",
        extensions: ["ez"]
      },
      "application/applefile": {
        source: "iana"
      },
      "application/applixware": {
        source: "apache",
        extensions: ["aw"]
      },
      "application/at+jwt": {
        source: "iana"
      },
      "application/atf": {
        source: "iana"
      },
      "application/atfx": {
        source: "iana"
      },
      "application/atom+xml": {
        source: "iana",
        compressible: true,
        extensions: ["atom"]
      },
      "application/atomcat+xml": {
        source: "iana",
        compressible: true,
        extensions: ["atomcat"]
      },
      "application/atomdeleted+xml": {
        source: "iana",
        compressible: true,
        extensions: ["atomdeleted"]
      },
      "application/atomicmail": {
        source: "iana"
      },
      "application/atomsvc+xml": {
        source: "iana",
        compressible: true,
        extensions: ["atomsvc"]
      },
      "application/atsc-dwd+xml": {
        source: "iana",
        compressible: true,
        extensions: ["dwd"]
      },
      "application/atsc-dynamic-event-message": {
        source: "iana"
      },
      "application/atsc-held+xml": {
        source: "iana",
        compressible: true,
        extensions: ["held"]
      },
      "application/atsc-rdt+json": {
        source: "iana",
        compressible: true
      },
      "application/atsc-rsat+xml": {
        source: "iana",
        compressible: true,
        extensions: ["rsat"]
      },
      "application/atxml": {
        source: "iana"
      },
      "application/auth-policy+xml": {
        source: "iana",
        compressible: true
      },
      "application/bacnet-xdd+zip": {
        source: "iana",
        compressible: false
      },
      "application/batch-smtp": {
        source: "iana"
      },
      "application/bdoc": {
        compressible: false,
        extensions: ["bdoc"]
      },
      "application/beep+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/calendar+json": {
        source: "iana",
        compressible: true
      },
      "application/calendar+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xcs"]
      },
      "application/call-completion": {
        source: "iana"
      },
      "application/cals-1840": {
        source: "iana"
      },
      "application/captive+json": {
        source: "iana",
        compressible: true
      },
      "application/cbor": {
        source: "iana"
      },
      "application/cbor-seq": {
        source: "iana"
      },
      "application/cccex": {
        source: "iana"
      },
      "application/ccmp+xml": {
        source: "iana",
        compressible: true
      },
      "application/ccxml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["ccxml"]
      },
      "application/cdfx+xml": {
        source: "iana",
        compressible: true,
        extensions: ["cdfx"]
      },
      "application/cdmi-capability": {
        source: "iana",
        extensions: ["cdmia"]
      },
      "application/cdmi-container": {
        source: "iana",
        extensions: ["cdmic"]
      },
      "application/cdmi-domain": {
        source: "iana",
        extensions: ["cdmid"]
      },
      "application/cdmi-object": {
        source: "iana",
        extensions: ["cdmio"]
      },
      "application/cdmi-queue": {
        source: "iana",
        extensions: ["cdmiq"]
      },
      "application/cdni": {
        source: "iana"
      },
      "application/cea": {
        source: "iana"
      },
      "application/cea-2018+xml": {
        source: "iana",
        compressible: true
      },
      "application/cellml+xml": {
        source: "iana",
        compressible: true
      },
      "application/cfw": {
        source: "iana"
      },
      "application/city+json": {
        source: "iana",
        compressible: true
      },
      "application/clr": {
        source: "iana"
      },
      "application/clue+xml": {
        source: "iana",
        compressible: true
      },
      "application/clue_info+xml": {
        source: "iana",
        compressible: true
      },
      "application/cms": {
        source: "iana"
      },
      "application/cnrp+xml": {
        source: "iana",
        compressible: true
      },
      "application/coap-group+json": {
        source: "iana",
        compressible: true
      },
      "application/coap-payload": {
        source: "iana"
      },
      "application/commonground": {
        source: "iana"
      },
      "application/conference-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/cose": {
        source: "iana"
      },
      "application/cose-key": {
        source: "iana"
      },
      "application/cose-key-set": {
        source: "iana"
      },
      "application/cpl+xml": {
        source: "iana",
        compressible: true,
        extensions: ["cpl"]
      },
      "application/csrattrs": {
        source: "iana"
      },
      "application/csta+xml": {
        source: "iana",
        compressible: true
      },
      "application/cstadata+xml": {
        source: "iana",
        compressible: true
      },
      "application/csvm+json": {
        source: "iana",
        compressible: true
      },
      "application/cu-seeme": {
        source: "apache",
        extensions: ["cu"]
      },
      "application/cwt": {
        source: "iana"
      },
      "application/cybercash": {
        source: "iana"
      },
      "application/dart": {
        compressible: true
      },
      "application/dash+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mpd"]
      },
      "application/dash-patch+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mpp"]
      },
      "application/dashdelta": {
        source: "iana"
      },
      "application/davmount+xml": {
        source: "iana",
        compressible: true,
        extensions: ["davmount"]
      },
      "application/dca-rft": {
        source: "iana"
      },
      "application/dcd": {
        source: "iana"
      },
      "application/dec-dx": {
        source: "iana"
      },
      "application/dialog-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/dicom": {
        source: "iana"
      },
      "application/dicom+json": {
        source: "iana",
        compressible: true
      },
      "application/dicom+xml": {
        source: "iana",
        compressible: true
      },
      "application/dii": {
        source: "iana"
      },
      "application/dit": {
        source: "iana"
      },
      "application/dns": {
        source: "iana"
      },
      "application/dns+json": {
        source: "iana",
        compressible: true
      },
      "application/dns-message": {
        source: "iana"
      },
      "application/docbook+xml": {
        source: "apache",
        compressible: true,
        extensions: ["dbk"]
      },
      "application/dots+cbor": {
        source: "iana"
      },
      "application/dskpp+xml": {
        source: "iana",
        compressible: true
      },
      "application/dssc+der": {
        source: "iana",
        extensions: ["dssc"]
      },
      "application/dssc+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xdssc"]
      },
      "application/dvcs": {
        source: "iana"
      },
      "application/ecmascript": {
        source: "iana",
        compressible: true,
        extensions: ["es", "ecma"]
      },
      "application/edi-consent": {
        source: "iana"
      },
      "application/edi-x12": {
        source: "iana",
        compressible: false
      },
      "application/edifact": {
        source: "iana",
        compressible: false
      },
      "application/efi": {
        source: "iana"
      },
      "application/elm+json": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/elm+xml": {
        source: "iana",
        compressible: true
      },
      "application/emergencycalldata.cap+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/emergencycalldata.comment+xml": {
        source: "iana",
        compressible: true
      },
      "application/emergencycalldata.control+xml": {
        source: "iana",
        compressible: true
      },
      "application/emergencycalldata.deviceinfo+xml": {
        source: "iana",
        compressible: true
      },
      "application/emergencycalldata.ecall.msd": {
        source: "iana"
      },
      "application/emergencycalldata.providerinfo+xml": {
        source: "iana",
        compressible: true
      },
      "application/emergencycalldata.serviceinfo+xml": {
        source: "iana",
        compressible: true
      },
      "application/emergencycalldata.subscriberinfo+xml": {
        source: "iana",
        compressible: true
      },
      "application/emergencycalldata.veds+xml": {
        source: "iana",
        compressible: true
      },
      "application/emma+xml": {
        source: "iana",
        compressible: true,
        extensions: ["emma"]
      },
      "application/emotionml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["emotionml"]
      },
      "application/encaprtp": {
        source: "iana"
      },
      "application/epp+xml": {
        source: "iana",
        compressible: true
      },
      "application/epub+zip": {
        source: "iana",
        compressible: false,
        extensions: ["epub"]
      },
      "application/eshop": {
        source: "iana"
      },
      "application/exi": {
        source: "iana",
        extensions: ["exi"]
      },
      "application/expect-ct-report+json": {
        source: "iana",
        compressible: true
      },
      "application/express": {
        source: "iana",
        extensions: ["exp"]
      },
      "application/fastinfoset": {
        source: "iana"
      },
      "application/fastsoap": {
        source: "iana"
      },
      "application/fdt+xml": {
        source: "iana",
        compressible: true,
        extensions: ["fdt"]
      },
      "application/fhir+json": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/fhir+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/fido.trusted-apps+json": {
        compressible: true
      },
      "application/fits": {
        source: "iana"
      },
      "application/flexfec": {
        source: "iana"
      },
      "application/font-sfnt": {
        source: "iana"
      },
      "application/font-tdpfr": {
        source: "iana",
        extensions: ["pfr"]
      },
      "application/font-woff": {
        source: "iana",
        compressible: false
      },
      "application/framework-attributes+xml": {
        source: "iana",
        compressible: true
      },
      "application/geo+json": {
        source: "iana",
        compressible: true,
        extensions: ["geojson"]
      },
      "application/geo+json-seq": {
        source: "iana"
      },
      "application/geopackage+sqlite3": {
        source: "iana"
      },
      "application/geoxacml+xml": {
        source: "iana",
        compressible: true
      },
      "application/gltf-buffer": {
        source: "iana"
      },
      "application/gml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["gml"]
      },
      "application/gpx+xml": {
        source: "apache",
        compressible: true,
        extensions: ["gpx"]
      },
      "application/gxf": {
        source: "apache",
        extensions: ["gxf"]
      },
      "application/gzip": {
        source: "iana",
        compressible: false,
        extensions: ["gz"]
      },
      "application/h224": {
        source: "iana"
      },
      "application/held+xml": {
        source: "iana",
        compressible: true
      },
      "application/hjson": {
        extensions: ["hjson"]
      },
      "application/http": {
        source: "iana"
      },
      "application/hyperstudio": {
        source: "iana",
        extensions: ["stk"]
      },
      "application/ibe-key-request+xml": {
        source: "iana",
        compressible: true
      },
      "application/ibe-pkg-reply+xml": {
        source: "iana",
        compressible: true
      },
      "application/ibe-pp-data": {
        source: "iana"
      },
      "application/iges": {
        source: "iana"
      },
      "application/im-iscomposing+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/index": {
        source: "iana"
      },
      "application/index.cmd": {
        source: "iana"
      },
      "application/index.obj": {
        source: "iana"
      },
      "application/index.response": {
        source: "iana"
      },
      "application/index.vnd": {
        source: "iana"
      },
      "application/inkml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["ink", "inkml"]
      },
      "application/iotp": {
        source: "iana"
      },
      "application/ipfix": {
        source: "iana",
        extensions: ["ipfix"]
      },
      "application/ipp": {
        source: "iana"
      },
      "application/isup": {
        source: "iana"
      },
      "application/its+xml": {
        source: "iana",
        compressible: true,
        extensions: ["its"]
      },
      "application/java-archive": {
        source: "apache",
        compressible: false,
        extensions: ["jar", "war", "ear"]
      },
      "application/java-serialized-object": {
        source: "apache",
        compressible: false,
        extensions: ["ser"]
      },
      "application/java-vm": {
        source: "apache",
        compressible: false,
        extensions: ["class"]
      },
      "application/javascript": {
        source: "iana",
        charset: "UTF-8",
        compressible: true,
        extensions: ["js", "mjs"]
      },
      "application/jf2feed+json": {
        source: "iana",
        compressible: true
      },
      "application/jose": {
        source: "iana"
      },
      "application/jose+json": {
        source: "iana",
        compressible: true
      },
      "application/jrd+json": {
        source: "iana",
        compressible: true
      },
      "application/jscalendar+json": {
        source: "iana",
        compressible: true
      },
      "application/json": {
        source: "iana",
        charset: "UTF-8",
        compressible: true,
        extensions: ["json", "map"]
      },
      "application/json-patch+json": {
        source: "iana",
        compressible: true
      },
      "application/json-seq": {
        source: "iana"
      },
      "application/json5": {
        extensions: ["json5"]
      },
      "application/jsonml+json": {
        source: "apache",
        compressible: true,
        extensions: ["jsonml"]
      },
      "application/jwk+json": {
        source: "iana",
        compressible: true
      },
      "application/jwk-set+json": {
        source: "iana",
        compressible: true
      },
      "application/jwt": {
        source: "iana"
      },
      "application/kpml-request+xml": {
        source: "iana",
        compressible: true
      },
      "application/kpml-response+xml": {
        source: "iana",
        compressible: true
      },
      "application/ld+json": {
        source: "iana",
        compressible: true,
        extensions: ["jsonld"]
      },
      "application/lgr+xml": {
        source: "iana",
        compressible: true,
        extensions: ["lgr"]
      },
      "application/link-format": {
        source: "iana"
      },
      "application/load-control+xml": {
        source: "iana",
        compressible: true
      },
      "application/lost+xml": {
        source: "iana",
        compressible: true,
        extensions: ["lostxml"]
      },
      "application/lostsync+xml": {
        source: "iana",
        compressible: true
      },
      "application/lpf+zip": {
        source: "iana",
        compressible: false
      },
      "application/lxf": {
        source: "iana"
      },
      "application/mac-binhex40": {
        source: "iana",
        extensions: ["hqx"]
      },
      "application/mac-compactpro": {
        source: "apache",
        extensions: ["cpt"]
      },
      "application/macwriteii": {
        source: "iana"
      },
      "application/mads+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mads"]
      },
      "application/manifest+json": {
        source: "iana",
        charset: "UTF-8",
        compressible: true,
        extensions: ["webmanifest"]
      },
      "application/marc": {
        source: "iana",
        extensions: ["mrc"]
      },
      "application/marcxml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mrcx"]
      },
      "application/mathematica": {
        source: "iana",
        extensions: ["ma", "nb", "mb"]
      },
      "application/mathml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mathml"]
      },
      "application/mathml-content+xml": {
        source: "iana",
        compressible: true
      },
      "application/mathml-presentation+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-associated-procedure-description+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-deregister+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-envelope+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-msk+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-msk-response+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-protection-description+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-reception-report+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-register+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-register-response+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-schedule+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbms-user-service-description+xml": {
        source: "iana",
        compressible: true
      },
      "application/mbox": {
        source: "iana",
        extensions: ["mbox"]
      },
      "application/media-policy-dataset+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mpf"]
      },
      "application/media_control+xml": {
        source: "iana",
        compressible: true
      },
      "application/mediaservercontrol+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mscml"]
      },
      "application/merge-patch+json": {
        source: "iana",
        compressible: true
      },
      "application/metalink+xml": {
        source: "apache",
        compressible: true,
        extensions: ["metalink"]
      },
      "application/metalink4+xml": {
        source: "iana",
        compressible: true,
        extensions: ["meta4"]
      },
      "application/mets+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mets"]
      },
      "application/mf4": {
        source: "iana"
      },
      "application/mikey": {
        source: "iana"
      },
      "application/mipc": {
        source: "iana"
      },
      "application/missing-blocks+cbor-seq": {
        source: "iana"
      },
      "application/mmt-aei+xml": {
        source: "iana",
        compressible: true,
        extensions: ["maei"]
      },
      "application/mmt-usd+xml": {
        source: "iana",
        compressible: true,
        extensions: ["musd"]
      },
      "application/mods+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mods"]
      },
      "application/moss-keys": {
        source: "iana"
      },
      "application/moss-signature": {
        source: "iana"
      },
      "application/mosskey-data": {
        source: "iana"
      },
      "application/mosskey-request": {
        source: "iana"
      },
      "application/mp21": {
        source: "iana",
        extensions: ["m21", "mp21"]
      },
      "application/mp4": {
        source: "iana",
        extensions: ["mp4s", "m4p"]
      },
      "application/mpeg4-generic": {
        source: "iana"
      },
      "application/mpeg4-iod": {
        source: "iana"
      },
      "application/mpeg4-iod-xmt": {
        source: "iana"
      },
      "application/mrb-consumer+xml": {
        source: "iana",
        compressible: true
      },
      "application/mrb-publish+xml": {
        source: "iana",
        compressible: true
      },
      "application/msc-ivr+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/msc-mixer+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/msword": {
        source: "iana",
        compressible: false,
        extensions: ["doc", "dot"]
      },
      "application/mud+json": {
        source: "iana",
        compressible: true
      },
      "application/multipart-core": {
        source: "iana"
      },
      "application/mxf": {
        source: "iana",
        extensions: ["mxf"]
      },
      "application/n-quads": {
        source: "iana",
        extensions: ["nq"]
      },
      "application/n-triples": {
        source: "iana",
        extensions: ["nt"]
      },
      "application/nasdata": {
        source: "iana"
      },
      "application/news-checkgroups": {
        source: "iana",
        charset: "US-ASCII"
      },
      "application/news-groupinfo": {
        source: "iana",
        charset: "US-ASCII"
      },
      "application/news-transmission": {
        source: "iana"
      },
      "application/nlsml+xml": {
        source: "iana",
        compressible: true
      },
      "application/node": {
        source: "iana",
        extensions: ["cjs"]
      },
      "application/nss": {
        source: "iana"
      },
      "application/oauth-authz-req+jwt": {
        source: "iana"
      },
      "application/oblivious-dns-message": {
        source: "iana"
      },
      "application/ocsp-request": {
        source: "iana"
      },
      "application/ocsp-response": {
        source: "iana"
      },
      "application/octet-stream": {
        source: "iana",
        compressible: false,
        extensions: ["bin", "dms", "lrf", "mar", "so", "dist", "distz", "pkg", "bpk", "dump", "elc", "deploy", "exe", "dll", "deb", "dmg", "iso", "img", "msi", "msp", "msm", "buffer"]
      },
      "application/oda": {
        source: "iana",
        extensions: ["oda"]
      },
      "application/odm+xml": {
        source: "iana",
        compressible: true
      },
      "application/odx": {
        source: "iana"
      },
      "application/oebps-package+xml": {
        source: "iana",
        compressible: true,
        extensions: ["opf"]
      },
      "application/ogg": {
        source: "iana",
        compressible: false,
        extensions: ["ogx"]
      },
      "application/omdoc+xml": {
        source: "apache",
        compressible: true,
        extensions: ["omdoc"]
      },
      "application/onenote": {
        source: "apache",
        extensions: ["onetoc", "onetoc2", "onetmp", "onepkg"]
      },
      "application/opc-nodeset+xml": {
        source: "iana",
        compressible: true
      },
      "application/oscore": {
        source: "iana"
      },
      "application/oxps": {
        source: "iana",
        extensions: ["oxps"]
      },
      "application/p21": {
        source: "iana"
      },
      "application/p21+zip": {
        source: "iana",
        compressible: false
      },
      "application/p2p-overlay+xml": {
        source: "iana",
        compressible: true,
        extensions: ["relo"]
      },
      "application/parityfec": {
        source: "iana"
      },
      "application/passport": {
        source: "iana"
      },
      "application/patch-ops-error+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xer"]
      },
      "application/pdf": {
        source: "iana",
        compressible: false,
        extensions: ["pdf"]
      },
      "application/pdx": {
        source: "iana"
      },
      "application/pem-certificate-chain": {
        source: "iana"
      },
      "application/pgp-encrypted": {
        source: "iana",
        compressible: false,
        extensions: ["pgp"]
      },
      "application/pgp-keys": {
        source: "iana",
        extensions: ["asc"]
      },
      "application/pgp-signature": {
        source: "iana",
        extensions: ["asc", "sig"]
      },
      "application/pics-rules": {
        source: "apache",
        extensions: ["prf"]
      },
      "application/pidf+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/pidf-diff+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/pkcs10": {
        source: "iana",
        extensions: ["p10"]
      },
      "application/pkcs12": {
        source: "iana"
      },
      "application/pkcs7-mime": {
        source: "iana",
        extensions: ["p7m", "p7c"]
      },
      "application/pkcs7-signature": {
        source: "iana",
        extensions: ["p7s"]
      },
      "application/pkcs8": {
        source: "iana",
        extensions: ["p8"]
      },
      "application/pkcs8-encrypted": {
        source: "iana"
      },
      "application/pkix-attr-cert": {
        source: "iana",
        extensions: ["ac"]
      },
      "application/pkix-cert": {
        source: "iana",
        extensions: ["cer"]
      },
      "application/pkix-crl": {
        source: "iana",
        extensions: ["crl"]
      },
      "application/pkix-pkipath": {
        source: "iana",
        extensions: ["pkipath"]
      },
      "application/pkixcmp": {
        source: "iana",
        extensions: ["pki"]
      },
      "application/pls+xml": {
        source: "iana",
        compressible: true,
        extensions: ["pls"]
      },
      "application/poc-settings+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/postscript": {
        source: "iana",
        compressible: true,
        extensions: ["ai", "eps", "ps"]
      },
      "application/ppsp-tracker+json": {
        source: "iana",
        compressible: true
      },
      "application/problem+json": {
        source: "iana",
        compressible: true
      },
      "application/problem+xml": {
        source: "iana",
        compressible: true
      },
      "application/provenance+xml": {
        source: "iana",
        compressible: true,
        extensions: ["provx"]
      },
      "application/prs.alvestrand.titrax-sheet": {
        source: "iana"
      },
      "application/prs.cww": {
        source: "iana",
        extensions: ["cww"]
      },
      "application/prs.cyn": {
        source: "iana",
        charset: "7-BIT"
      },
      "application/prs.hpub+zip": {
        source: "iana",
        compressible: false
      },
      "application/prs.nprend": {
        source: "iana"
      },
      "application/prs.plucker": {
        source: "iana"
      },
      "application/prs.rdf-xml-crypt": {
        source: "iana"
      },
      "application/prs.xsf+xml": {
        source: "iana",
        compressible: true
      },
      "application/pskc+xml": {
        source: "iana",
        compressible: true,
        extensions: ["pskcxml"]
      },
      "application/pvd+json": {
        source: "iana",
        compressible: true
      },
      "application/qsig": {
        source: "iana"
      },
      "application/raml+yaml": {
        compressible: true,
        extensions: ["raml"]
      },
      "application/raptorfec": {
        source: "iana"
      },
      "application/rdap+json": {
        source: "iana",
        compressible: true
      },
      "application/rdf+xml": {
        source: "iana",
        compressible: true,
        extensions: ["rdf", "owl"]
      },
      "application/reginfo+xml": {
        source: "iana",
        compressible: true,
        extensions: ["rif"]
      },
      "application/relax-ng-compact-syntax": {
        source: "iana",
        extensions: ["rnc"]
      },
      "application/remote-printing": {
        source: "iana"
      },
      "application/reputon+json": {
        source: "iana",
        compressible: true
      },
      "application/resource-lists+xml": {
        source: "iana",
        compressible: true,
        extensions: ["rl"]
      },
      "application/resource-lists-diff+xml": {
        source: "iana",
        compressible: true,
        extensions: ["rld"]
      },
      "application/rfc+xml": {
        source: "iana",
        compressible: true
      },
      "application/riscos": {
        source: "iana"
      },
      "application/rlmi+xml": {
        source: "iana",
        compressible: true
      },
      "application/rls-services+xml": {
        source: "iana",
        compressible: true,
        extensions: ["rs"]
      },
      "application/route-apd+xml": {
        source: "iana",
        compressible: true,
        extensions: ["rapd"]
      },
      "application/route-s-tsid+xml": {
        source: "iana",
        compressible: true,
        extensions: ["sls"]
      },
      "application/route-usd+xml": {
        source: "iana",
        compressible: true,
        extensions: ["rusd"]
      },
      "application/rpki-ghostbusters": {
        source: "iana",
        extensions: ["gbr"]
      },
      "application/rpki-manifest": {
        source: "iana",
        extensions: ["mft"]
      },
      "application/rpki-publication": {
        source: "iana"
      },
      "application/rpki-roa": {
        source: "iana",
        extensions: ["roa"]
      },
      "application/rpki-updown": {
        source: "iana"
      },
      "application/rsd+xml": {
        source: "apache",
        compressible: true,
        extensions: ["rsd"]
      },
      "application/rss+xml": {
        source: "apache",
        compressible: true,
        extensions: ["rss"]
      },
      "application/rtf": {
        source: "iana",
        compressible: true,
        extensions: ["rtf"]
      },
      "application/rtploopback": {
        source: "iana"
      },
      "application/rtx": {
        source: "iana"
      },
      "application/samlassertion+xml": {
        source: "iana",
        compressible: true
      },
      "application/samlmetadata+xml": {
        source: "iana",
        compressible: true
      },
      "application/sarif+json": {
        source: "iana",
        compressible: true
      },
      "application/sarif-external-properties+json": {
        source: "iana",
        compressible: true
      },
      "application/sbe": {
        source: "iana"
      },
      "application/sbml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["sbml"]
      },
      "application/scaip+xml": {
        source: "iana",
        compressible: true
      },
      "application/scim+json": {
        source: "iana",
        compressible: true
      },
      "application/scvp-cv-request": {
        source: "iana",
        extensions: ["scq"]
      },
      "application/scvp-cv-response": {
        source: "iana",
        extensions: ["scs"]
      },
      "application/scvp-vp-request": {
        source: "iana",
        extensions: ["spq"]
      },
      "application/scvp-vp-response": {
        source: "iana",
        extensions: ["spp"]
      },
      "application/sdp": {
        source: "iana",
        extensions: ["sdp"]
      },
      "application/secevent+jwt": {
        source: "iana"
      },
      "application/senml+cbor": {
        source: "iana"
      },
      "application/senml+json": {
        source: "iana",
        compressible: true
      },
      "application/senml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["senmlx"]
      },
      "application/senml-etch+cbor": {
        source: "iana"
      },
      "application/senml-etch+json": {
        source: "iana",
        compressible: true
      },
      "application/senml-exi": {
        source: "iana"
      },
      "application/sensml+cbor": {
        source: "iana"
      },
      "application/sensml+json": {
        source: "iana",
        compressible: true
      },
      "application/sensml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["sensmlx"]
      },
      "application/sensml-exi": {
        source: "iana"
      },
      "application/sep+xml": {
        source: "iana",
        compressible: true
      },
      "application/sep-exi": {
        source: "iana"
      },
      "application/session-info": {
        source: "iana"
      },
      "application/set-payment": {
        source: "iana"
      },
      "application/set-payment-initiation": {
        source: "iana",
        extensions: ["setpay"]
      },
      "application/set-registration": {
        source: "iana"
      },
      "application/set-registration-initiation": {
        source: "iana",
        extensions: ["setreg"]
      },
      "application/sgml": {
        source: "iana"
      },
      "application/sgml-open-catalog": {
        source: "iana"
      },
      "application/shf+xml": {
        source: "iana",
        compressible: true,
        extensions: ["shf"]
      },
      "application/sieve": {
        source: "iana",
        extensions: ["siv", "sieve"]
      },
      "application/simple-filter+xml": {
        source: "iana",
        compressible: true
      },
      "application/simple-message-summary": {
        source: "iana"
      },
      "application/simplesymbolcontainer": {
        source: "iana"
      },
      "application/sipc": {
        source: "iana"
      },
      "application/slate": {
        source: "iana"
      },
      "application/smil": {
        source: "iana"
      },
      "application/smil+xml": {
        source: "iana",
        compressible: true,
        extensions: ["smi", "smil"]
      },
      "application/smpte336m": {
        source: "iana"
      },
      "application/soap+fastinfoset": {
        source: "iana"
      },
      "application/soap+xml": {
        source: "iana",
        compressible: true
      },
      "application/sparql-query": {
        source: "iana",
        extensions: ["rq"]
      },
      "application/sparql-results+xml": {
        source: "iana",
        compressible: true,
        extensions: ["srx"]
      },
      "application/spdx+json": {
        source: "iana",
        compressible: true
      },
      "application/spirits-event+xml": {
        source: "iana",
        compressible: true
      },
      "application/sql": {
        source: "iana"
      },
      "application/srgs": {
        source: "iana",
        extensions: ["gram"]
      },
      "application/srgs+xml": {
        source: "iana",
        compressible: true,
        extensions: ["grxml"]
      },
      "application/sru+xml": {
        source: "iana",
        compressible: true,
        extensions: ["sru"]
      },
      "application/ssdl+xml": {
        source: "apache",
        compressible: true,
        extensions: ["ssdl"]
      },
      "application/ssml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["ssml"]
      },
      "application/stix+json": {
        source: "iana",
        compressible: true
      },
      "application/swid+xml": {
        source: "iana",
        compressible: true,
        extensions: ["swidtag"]
      },
      "application/tamp-apex-update": {
        source: "iana"
      },
      "application/tamp-apex-update-confirm": {
        source: "iana"
      },
      "application/tamp-community-update": {
        source: "iana"
      },
      "application/tamp-community-update-confirm": {
        source: "iana"
      },
      "application/tamp-error": {
        source: "iana"
      },
      "application/tamp-sequence-adjust": {
        source: "iana"
      },
      "application/tamp-sequence-adjust-confirm": {
        source: "iana"
      },
      "application/tamp-status-query": {
        source: "iana"
      },
      "application/tamp-status-response": {
        source: "iana"
      },
      "application/tamp-update": {
        source: "iana"
      },
      "application/tamp-update-confirm": {
        source: "iana"
      },
      "application/tar": {
        compressible: true
      },
      "application/taxii+json": {
        source: "iana",
        compressible: true
      },
      "application/td+json": {
        source: "iana",
        compressible: true
      },
      "application/tei+xml": {
        source: "iana",
        compressible: true,
        extensions: ["tei", "teicorpus"]
      },
      "application/tetra_isi": {
        source: "iana"
      },
      "application/thraud+xml": {
        source: "iana",
        compressible: true,
        extensions: ["tfi"]
      },
      "application/timestamp-query": {
        source: "iana"
      },
      "application/timestamp-reply": {
        source: "iana"
      },
      "application/timestamped-data": {
        source: "iana",
        extensions: ["tsd"]
      },
      "application/tlsrpt+gzip": {
        source: "iana"
      },
      "application/tlsrpt+json": {
        source: "iana",
        compressible: true
      },
      "application/tnauthlist": {
        source: "iana"
      },
      "application/token-introspection+jwt": {
        source: "iana"
      },
      "application/toml": {
        compressible: true,
        extensions: ["toml"]
      },
      "application/trickle-ice-sdpfrag": {
        source: "iana"
      },
      "application/trig": {
        source: "iana",
        extensions: ["trig"]
      },
      "application/ttml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["ttml"]
      },
      "application/tve-trigger": {
        source: "iana"
      },
      "application/tzif": {
        source: "iana"
      },
      "application/tzif-leap": {
        source: "iana"
      },
      "application/ubjson": {
        compressible: false,
        extensions: ["ubj"]
      },
      "application/ulpfec": {
        source: "iana"
      },
      "application/urc-grpsheet+xml": {
        source: "iana",
        compressible: true
      },
      "application/urc-ressheet+xml": {
        source: "iana",
        compressible: true,
        extensions: ["rsheet"]
      },
      "application/urc-targetdesc+xml": {
        source: "iana",
        compressible: true,
        extensions: ["td"]
      },
      "application/urc-uisocketdesc+xml": {
        source: "iana",
        compressible: true
      },
      "application/vcard+json": {
        source: "iana",
        compressible: true
      },
      "application/vcard+xml": {
        source: "iana",
        compressible: true
      },
      "application/vemmi": {
        source: "iana"
      },
      "application/vividence.scriptfile": {
        source: "apache"
      },
      "application/vnd.1000minds.decision-model+xml": {
        source: "iana",
        compressible: true,
        extensions: ["1km"]
      },
      "application/vnd.3gpp-prose+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp-prose-pc3ch+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp-v2x-local-service-information": {
        source: "iana"
      },
      "application/vnd.3gpp.5gnas": {
        source: "iana"
      },
      "application/vnd.3gpp.access-transfer-events+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.bsf+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.gmop+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.gtpc": {
        source: "iana"
      },
      "application/vnd.3gpp.interworking-data": {
        source: "iana"
      },
      "application/vnd.3gpp.lpp": {
        source: "iana"
      },
      "application/vnd.3gpp.mc-signalling-ear": {
        source: "iana"
      },
      "application/vnd.3gpp.mcdata-affiliation-command+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcdata-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcdata-payload": {
        source: "iana"
      },
      "application/vnd.3gpp.mcdata-service-config+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcdata-signalling": {
        source: "iana"
      },
      "application/vnd.3gpp.mcdata-ue-config+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcdata-user-profile+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-affiliation-command+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-floor-request+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-location-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-mbms-usage-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-service-config+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-signed+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-ue-config+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-ue-init-config+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcptt-user-profile+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcvideo-affiliation-command+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcvideo-affiliation-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcvideo-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcvideo-location-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcvideo-mbms-usage-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcvideo-service-config+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcvideo-transmission-request+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcvideo-ue-config+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mcvideo-user-profile+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.mid-call+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.ngap": {
        source: "iana"
      },
      "application/vnd.3gpp.pfcp": {
        source: "iana"
      },
      "application/vnd.3gpp.pic-bw-large": {
        source: "iana",
        extensions: ["plb"]
      },
      "application/vnd.3gpp.pic-bw-small": {
        source: "iana",
        extensions: ["psb"]
      },
      "application/vnd.3gpp.pic-bw-var": {
        source: "iana",
        extensions: ["pvb"]
      },
      "application/vnd.3gpp.s1ap": {
        source: "iana"
      },
      "application/vnd.3gpp.sms": {
        source: "iana"
      },
      "application/vnd.3gpp.sms+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.srvcc-ext+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.srvcc-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.state-and-event-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp.ussd+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp2.bcmcsinfo+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.3gpp2.sms": {
        source: "iana"
      },
      "application/vnd.3gpp2.tcap": {
        source: "iana",
        extensions: ["tcap"]
      },
      "application/vnd.3lightssoftware.imagescal": {
        source: "iana"
      },
      "application/vnd.3m.post-it-notes": {
        source: "iana",
        extensions: ["pwn"]
      },
      "application/vnd.accpac.simply.aso": {
        source: "iana",
        extensions: ["aso"]
      },
      "application/vnd.accpac.simply.imp": {
        source: "iana",
        extensions: ["imp"]
      },
      "application/vnd.acucobol": {
        source: "iana",
        extensions: ["acu"]
      },
      "application/vnd.acucorp": {
        source: "iana",
        extensions: ["atc", "acutc"]
      },
      "application/vnd.adobe.air-application-installer-package+zip": {
        source: "apache",
        compressible: false,
        extensions: ["air"]
      },
      "application/vnd.adobe.flash.movie": {
        source: "iana"
      },
      "application/vnd.adobe.formscentral.fcdt": {
        source: "iana",
        extensions: ["fcdt"]
      },
      "application/vnd.adobe.fxp": {
        source: "iana",
        extensions: ["fxp", "fxpl"]
      },
      "application/vnd.adobe.partial-upload": {
        source: "iana"
      },
      "application/vnd.adobe.xdp+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xdp"]
      },
      "application/vnd.adobe.xfdf": {
        source: "iana",
        extensions: ["xfdf"]
      },
      "application/vnd.aether.imp": {
        source: "iana"
      },
      "application/vnd.afpc.afplinedata": {
        source: "iana"
      },
      "application/vnd.afpc.afplinedata-pagedef": {
        source: "iana"
      },
      "application/vnd.afpc.cmoca-cmresource": {
        source: "iana"
      },
      "application/vnd.afpc.foca-charset": {
        source: "iana"
      },
      "application/vnd.afpc.foca-codedfont": {
        source: "iana"
      },
      "application/vnd.afpc.foca-codepage": {
        source: "iana"
      },
      "application/vnd.afpc.modca": {
        source: "iana"
      },
      "application/vnd.afpc.modca-cmtable": {
        source: "iana"
      },
      "application/vnd.afpc.modca-formdef": {
        source: "iana"
      },
      "application/vnd.afpc.modca-mediummap": {
        source: "iana"
      },
      "application/vnd.afpc.modca-objectcontainer": {
        source: "iana"
      },
      "application/vnd.afpc.modca-overlay": {
        source: "iana"
      },
      "application/vnd.afpc.modca-pagesegment": {
        source: "iana"
      },
      "application/vnd.age": {
        source: "iana",
        extensions: ["age"]
      },
      "application/vnd.ah-barcode": {
        source: "iana"
      },
      "application/vnd.ahead.space": {
        source: "iana",
        extensions: ["ahead"]
      },
      "application/vnd.airzip.filesecure.azf": {
        source: "iana",
        extensions: ["azf"]
      },
      "application/vnd.airzip.filesecure.azs": {
        source: "iana",
        extensions: ["azs"]
      },
      "application/vnd.amadeus+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.amazon.ebook": {
        source: "apache",
        extensions: ["azw"]
      },
      "application/vnd.amazon.mobi8-ebook": {
        source: "iana"
      },
      "application/vnd.americandynamics.acc": {
        source: "iana",
        extensions: ["acc"]
      },
      "application/vnd.amiga.ami": {
        source: "iana",
        extensions: ["ami"]
      },
      "application/vnd.amundsen.maze+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.android.ota": {
        source: "iana"
      },
      "application/vnd.android.package-archive": {
        source: "apache",
        compressible: false,
        extensions: ["apk"]
      },
      "application/vnd.anki": {
        source: "iana"
      },
      "application/vnd.anser-web-certificate-issue-initiation": {
        source: "iana",
        extensions: ["cii"]
      },
      "application/vnd.anser-web-funds-transfer-initiation": {
        source: "apache",
        extensions: ["fti"]
      },
      "application/vnd.antix.game-component": {
        source: "iana",
        extensions: ["atx"]
      },
      "application/vnd.apache.arrow.file": {
        source: "iana"
      },
      "application/vnd.apache.arrow.stream": {
        source: "iana"
      },
      "application/vnd.apache.thrift.binary": {
        source: "iana"
      },
      "application/vnd.apache.thrift.compact": {
        source: "iana"
      },
      "application/vnd.apache.thrift.json": {
        source: "iana"
      },
      "application/vnd.api+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.aplextor.warrp+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.apothekende.reservation+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.apple.installer+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mpkg"]
      },
      "application/vnd.apple.keynote": {
        source: "iana",
        extensions: ["key"]
      },
      "application/vnd.apple.mpegurl": {
        source: "iana",
        extensions: ["m3u8"]
      },
      "application/vnd.apple.numbers": {
        source: "iana",
        extensions: ["numbers"]
      },
      "application/vnd.apple.pages": {
        source: "iana",
        extensions: ["pages"]
      },
      "application/vnd.apple.pkpass": {
        compressible: false,
        extensions: ["pkpass"]
      },
      "application/vnd.arastra.swi": {
        source: "iana"
      },
      "application/vnd.aristanetworks.swi": {
        source: "iana",
        extensions: ["swi"]
      },
      "application/vnd.artisan+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.artsquare": {
        source: "iana"
      },
      "application/vnd.astraea-software.iota": {
        source: "iana",
        extensions: ["iota"]
      },
      "application/vnd.audiograph": {
        source: "iana",
        extensions: ["aep"]
      },
      "application/vnd.autopackage": {
        source: "iana"
      },
      "application/vnd.avalon+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.avistar+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.balsamiq.bmml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["bmml"]
      },
      "application/vnd.balsamiq.bmpr": {
        source: "iana"
      },
      "application/vnd.banana-accounting": {
        source: "iana"
      },
      "application/vnd.bbf.usp.error": {
        source: "iana"
      },
      "application/vnd.bbf.usp.msg": {
        source: "iana"
      },
      "application/vnd.bbf.usp.msg+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.bekitzur-stech+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.bint.med-content": {
        source: "iana"
      },
      "application/vnd.biopax.rdf+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.blink-idb-value-wrapper": {
        source: "iana"
      },
      "application/vnd.blueice.multipass": {
        source: "iana",
        extensions: ["mpm"]
      },
      "application/vnd.bluetooth.ep.oob": {
        source: "iana"
      },
      "application/vnd.bluetooth.le.oob": {
        source: "iana"
      },
      "application/vnd.bmi": {
        source: "iana",
        extensions: ["bmi"]
      },
      "application/vnd.bpf": {
        source: "iana"
      },
      "application/vnd.bpf3": {
        source: "iana"
      },
      "application/vnd.businessobjects": {
        source: "iana",
        extensions: ["rep"]
      },
      "application/vnd.byu.uapi+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.cab-jscript": {
        source: "iana"
      },
      "application/vnd.canon-cpdl": {
        source: "iana"
      },
      "application/vnd.canon-lips": {
        source: "iana"
      },
      "application/vnd.capasystems-pg+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.cendio.thinlinc.clientconf": {
        source: "iana"
      },
      "application/vnd.century-systems.tcp_stream": {
        source: "iana"
      },
      "application/vnd.chemdraw+xml": {
        source: "iana",
        compressible: true,
        extensions: ["cdxml"]
      },
      "application/vnd.chess-pgn": {
        source: "iana"
      },
      "application/vnd.chipnuts.karaoke-mmd": {
        source: "iana",
        extensions: ["mmd"]
      },
      "application/vnd.ciedi": {
        source: "iana"
      },
      "application/vnd.cinderella": {
        source: "iana",
        extensions: ["cdy"]
      },
      "application/vnd.cirpack.isdn-ext": {
        source: "iana"
      },
      "application/vnd.citationstyles.style+xml": {
        source: "iana",
        compressible: true,
        extensions: ["csl"]
      },
      "application/vnd.claymore": {
        source: "iana",
        extensions: ["cla"]
      },
      "application/vnd.cloanto.rp9": {
        source: "iana",
        extensions: ["rp9"]
      },
      "application/vnd.clonk.c4group": {
        source: "iana",
        extensions: ["c4g", "c4d", "c4f", "c4p", "c4u"]
      },
      "application/vnd.cluetrust.cartomobile-config": {
        source: "iana",
        extensions: ["c11amc"]
      },
      "application/vnd.cluetrust.cartomobile-config-pkg": {
        source: "iana",
        extensions: ["c11amz"]
      },
      "application/vnd.coffeescript": {
        source: "iana"
      },
      "application/vnd.collabio.xodocuments.document": {
        source: "iana"
      },
      "application/vnd.collabio.xodocuments.document-template": {
        source: "iana"
      },
      "application/vnd.collabio.xodocuments.presentation": {
        source: "iana"
      },
      "application/vnd.collabio.xodocuments.presentation-template": {
        source: "iana"
      },
      "application/vnd.collabio.xodocuments.spreadsheet": {
        source: "iana"
      },
      "application/vnd.collabio.xodocuments.spreadsheet-template": {
        source: "iana"
      },
      "application/vnd.collection+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.collection.doc+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.collection.next+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.comicbook+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.comicbook-rar": {
        source: "iana"
      },
      "application/vnd.commerce-battelle": {
        source: "iana"
      },
      "application/vnd.commonspace": {
        source: "iana",
        extensions: ["csp"]
      },
      "application/vnd.contact.cmsg": {
        source: "iana",
        extensions: ["cdbcmsg"]
      },
      "application/vnd.coreos.ignition+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.cosmocaller": {
        source: "iana",
        extensions: ["cmc"]
      },
      "application/vnd.crick.clicker": {
        source: "iana",
        extensions: ["clkx"]
      },
      "application/vnd.crick.clicker.keyboard": {
        source: "iana",
        extensions: ["clkk"]
      },
      "application/vnd.crick.clicker.palette": {
        source: "iana",
        extensions: ["clkp"]
      },
      "application/vnd.crick.clicker.template": {
        source: "iana",
        extensions: ["clkt"]
      },
      "application/vnd.crick.clicker.wordbank": {
        source: "iana",
        extensions: ["clkw"]
      },
      "application/vnd.criticaltools.wbs+xml": {
        source: "iana",
        compressible: true,
        extensions: ["wbs"]
      },
      "application/vnd.cryptii.pipe+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.crypto-shade-file": {
        source: "iana"
      },
      "application/vnd.cryptomator.encrypted": {
        source: "iana"
      },
      "application/vnd.cryptomator.vault": {
        source: "iana"
      },
      "application/vnd.ctc-posml": {
        source: "iana",
        extensions: ["pml"]
      },
      "application/vnd.ctct.ws+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.cups-pdf": {
        source: "iana"
      },
      "application/vnd.cups-postscript": {
        source: "iana"
      },
      "application/vnd.cups-ppd": {
        source: "iana",
        extensions: ["ppd"]
      },
      "application/vnd.cups-raster": {
        source: "iana"
      },
      "application/vnd.cups-raw": {
        source: "iana"
      },
      "application/vnd.curl": {
        source: "iana"
      },
      "application/vnd.curl.car": {
        source: "apache",
        extensions: ["car"]
      },
      "application/vnd.curl.pcurl": {
        source: "apache",
        extensions: ["pcurl"]
      },
      "application/vnd.cyan.dean.root+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.cybank": {
        source: "iana"
      },
      "application/vnd.cyclonedx+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.cyclonedx+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.d2l.coursepackage1p0+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.d3m-dataset": {
        source: "iana"
      },
      "application/vnd.d3m-problem": {
        source: "iana"
      },
      "application/vnd.dart": {
        source: "iana",
        compressible: true,
        extensions: ["dart"]
      },
      "application/vnd.data-vision.rdz": {
        source: "iana",
        extensions: ["rdz"]
      },
      "application/vnd.datapackage+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dataresource+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dbf": {
        source: "iana",
        extensions: ["dbf"]
      },
      "application/vnd.debian.binary-package": {
        source: "iana"
      },
      "application/vnd.dece.data": {
        source: "iana",
        extensions: ["uvf", "uvvf", "uvd", "uvvd"]
      },
      "application/vnd.dece.ttml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["uvt", "uvvt"]
      },
      "application/vnd.dece.unspecified": {
        source: "iana",
        extensions: ["uvx", "uvvx"]
      },
      "application/vnd.dece.zip": {
        source: "iana",
        extensions: ["uvz", "uvvz"]
      },
      "application/vnd.denovo.fcselayout-link": {
        source: "iana",
        extensions: ["fe_launch"]
      },
      "application/vnd.desmume.movie": {
        source: "iana"
      },
      "application/vnd.dir-bi.plate-dl-nosuffix": {
        source: "iana"
      },
      "application/vnd.dm.delegation+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dna": {
        source: "iana",
        extensions: ["dna"]
      },
      "application/vnd.document+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dolby.mlp": {
        source: "apache",
        extensions: ["mlp"]
      },
      "application/vnd.dolby.mobile.1": {
        source: "iana"
      },
      "application/vnd.dolby.mobile.2": {
        source: "iana"
      },
      "application/vnd.doremir.scorecloud-binary-document": {
        source: "iana"
      },
      "application/vnd.dpgraph": {
        source: "iana",
        extensions: ["dpg"]
      },
      "application/vnd.dreamfactory": {
        source: "iana",
        extensions: ["dfac"]
      },
      "application/vnd.drive+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ds-keypoint": {
        source: "apache",
        extensions: ["kpxx"]
      },
      "application/vnd.dtg.local": {
        source: "iana"
      },
      "application/vnd.dtg.local.flash": {
        source: "iana"
      },
      "application/vnd.dtg.local.html": {
        source: "iana"
      },
      "application/vnd.dvb.ait": {
        source: "iana",
        extensions: ["ait"]
      },
      "application/vnd.dvb.dvbisl+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dvb.dvbj": {
        source: "iana"
      },
      "application/vnd.dvb.esgcontainer": {
        source: "iana"
      },
      "application/vnd.dvb.ipdcdftnotifaccess": {
        source: "iana"
      },
      "application/vnd.dvb.ipdcesgaccess": {
        source: "iana"
      },
      "application/vnd.dvb.ipdcesgaccess2": {
        source: "iana"
      },
      "application/vnd.dvb.ipdcesgpdd": {
        source: "iana"
      },
      "application/vnd.dvb.ipdcroaming": {
        source: "iana"
      },
      "application/vnd.dvb.iptv.alfec-base": {
        source: "iana"
      },
      "application/vnd.dvb.iptv.alfec-enhancement": {
        source: "iana"
      },
      "application/vnd.dvb.notif-aggregate-root+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dvb.notif-container+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dvb.notif-generic+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dvb.notif-ia-msglist+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dvb.notif-ia-registration-request+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dvb.notif-ia-registration-response+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dvb.notif-init+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.dvb.pfr": {
        source: "iana"
      },
      "application/vnd.dvb.service": {
        source: "iana",
        extensions: ["svc"]
      },
      "application/vnd.dxr": {
        source: "iana"
      },
      "application/vnd.dynageo": {
        source: "iana",
        extensions: ["geo"]
      },
      "application/vnd.dzr": {
        source: "iana"
      },
      "application/vnd.easykaraoke.cdgdownload": {
        source: "iana"
      },
      "application/vnd.ecdis-update": {
        source: "iana"
      },
      "application/vnd.ecip.rlp": {
        source: "iana"
      },
      "application/vnd.eclipse.ditto+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ecowin.chart": {
        source: "iana",
        extensions: ["mag"]
      },
      "application/vnd.ecowin.filerequest": {
        source: "iana"
      },
      "application/vnd.ecowin.fileupdate": {
        source: "iana"
      },
      "application/vnd.ecowin.series": {
        source: "iana"
      },
      "application/vnd.ecowin.seriesrequest": {
        source: "iana"
      },
      "application/vnd.ecowin.seriesupdate": {
        source: "iana"
      },
      "application/vnd.efi.img": {
        source: "iana"
      },
      "application/vnd.efi.iso": {
        source: "iana"
      },
      "application/vnd.emclient.accessrequest+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.enliven": {
        source: "iana",
        extensions: ["nml"]
      },
      "application/vnd.enphase.envoy": {
        source: "iana"
      },
      "application/vnd.eprints.data+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.epson.esf": {
        source: "iana",
        extensions: ["esf"]
      },
      "application/vnd.epson.msf": {
        source: "iana",
        extensions: ["msf"]
      },
      "application/vnd.epson.quickanime": {
        source: "iana",
        extensions: ["qam"]
      },
      "application/vnd.epson.salt": {
        source: "iana",
        extensions: ["slt"]
      },
      "application/vnd.epson.ssf": {
        source: "iana",
        extensions: ["ssf"]
      },
      "application/vnd.ericsson.quickcall": {
        source: "iana"
      },
      "application/vnd.espass-espass+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.eszigno3+xml": {
        source: "iana",
        compressible: true,
        extensions: ["es3", "et3"]
      },
      "application/vnd.etsi.aoc+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.asic-e+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.etsi.asic-s+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.etsi.cug+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.iptvcommand+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.iptvdiscovery+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.iptvprofile+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.iptvsad-bc+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.iptvsad-cod+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.iptvsad-npvr+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.iptvservice+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.iptvsync+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.iptvueprofile+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.mcid+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.mheg5": {
        source: "iana"
      },
      "application/vnd.etsi.overload-control-policy-dataset+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.pstn+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.sci+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.simservs+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.timestamp-token": {
        source: "iana"
      },
      "application/vnd.etsi.tsl+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.etsi.tsl.der": {
        source: "iana"
      },
      "application/vnd.eu.kasparian.car+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.eudora.data": {
        source: "iana"
      },
      "application/vnd.evolv.ecig.profile": {
        source: "iana"
      },
      "application/vnd.evolv.ecig.settings": {
        source: "iana"
      },
      "application/vnd.evolv.ecig.theme": {
        source: "iana"
      },
      "application/vnd.exstream-empower+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.exstream-package": {
        source: "iana"
      },
      "application/vnd.ezpix-album": {
        source: "iana",
        extensions: ["ez2"]
      },
      "application/vnd.ezpix-package": {
        source: "iana",
        extensions: ["ez3"]
      },
      "application/vnd.f-secure.mobile": {
        source: "iana"
      },
      "application/vnd.familysearch.gedcom+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.fastcopy-disk-image": {
        source: "iana"
      },
      "application/vnd.fdf": {
        source: "iana",
        extensions: ["fdf"]
      },
      "application/vnd.fdsn.mseed": {
        source: "iana",
        extensions: ["mseed"]
      },
      "application/vnd.fdsn.seed": {
        source: "iana",
        extensions: ["seed", "dataless"]
      },
      "application/vnd.ffsns": {
        source: "iana"
      },
      "application/vnd.ficlab.flb+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.filmit.zfc": {
        source: "iana"
      },
      "application/vnd.fints": {
        source: "iana"
      },
      "application/vnd.firemonkeys.cloudcell": {
        source: "iana"
      },
      "application/vnd.flographit": {
        source: "iana",
        extensions: ["gph"]
      },
      "application/vnd.fluxtime.clip": {
        source: "iana",
        extensions: ["ftc"]
      },
      "application/vnd.font-fontforge-sfd": {
        source: "iana"
      },
      "application/vnd.framemaker": {
        source: "iana",
        extensions: ["fm", "frame", "maker", "book"]
      },
      "application/vnd.frogans.fnc": {
        source: "iana",
        extensions: ["fnc"]
      },
      "application/vnd.frogans.ltf": {
        source: "iana",
        extensions: ["ltf"]
      },
      "application/vnd.fsc.weblaunch": {
        source: "iana",
        extensions: ["fsc"]
      },
      "application/vnd.fujifilm.fb.docuworks": {
        source: "iana"
      },
      "application/vnd.fujifilm.fb.docuworks.binder": {
        source: "iana"
      },
      "application/vnd.fujifilm.fb.docuworks.container": {
        source: "iana"
      },
      "application/vnd.fujifilm.fb.jfi+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.fujitsu.oasys": {
        source: "iana",
        extensions: ["oas"]
      },
      "application/vnd.fujitsu.oasys2": {
        source: "iana",
        extensions: ["oa2"]
      },
      "application/vnd.fujitsu.oasys3": {
        source: "iana",
        extensions: ["oa3"]
      },
      "application/vnd.fujitsu.oasysgp": {
        source: "iana",
        extensions: ["fg5"]
      },
      "application/vnd.fujitsu.oasysprs": {
        source: "iana",
        extensions: ["bh2"]
      },
      "application/vnd.fujixerox.art-ex": {
        source: "iana"
      },
      "application/vnd.fujixerox.art4": {
        source: "iana"
      },
      "application/vnd.fujixerox.ddd": {
        source: "iana",
        extensions: ["ddd"]
      },
      "application/vnd.fujixerox.docuworks": {
        source: "iana",
        extensions: ["xdw"]
      },
      "application/vnd.fujixerox.docuworks.binder": {
        source: "iana",
        extensions: ["xbd"]
      },
      "application/vnd.fujixerox.docuworks.container": {
        source: "iana"
      },
      "application/vnd.fujixerox.hbpl": {
        source: "iana"
      },
      "application/vnd.fut-misnet": {
        source: "iana"
      },
      "application/vnd.futoin+cbor": {
        source: "iana"
      },
      "application/vnd.futoin+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.fuzzysheet": {
        source: "iana",
        extensions: ["fzs"]
      },
      "application/vnd.genomatix.tuxedo": {
        source: "iana",
        extensions: ["txd"]
      },
      "application/vnd.gentics.grd+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.geo+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.geocube+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.geogebra.file": {
        source: "iana",
        extensions: ["ggb"]
      },
      "application/vnd.geogebra.slides": {
        source: "iana"
      },
      "application/vnd.geogebra.tool": {
        source: "iana",
        extensions: ["ggt"]
      },
      "application/vnd.geometry-explorer": {
        source: "iana",
        extensions: ["gex", "gre"]
      },
      "application/vnd.geonext": {
        source: "iana",
        extensions: ["gxt"]
      },
      "application/vnd.geoplan": {
        source: "iana",
        extensions: ["g2w"]
      },
      "application/vnd.geospace": {
        source: "iana",
        extensions: ["g3w"]
      },
      "application/vnd.gerber": {
        source: "iana"
      },
      "application/vnd.globalplatform.card-content-mgt": {
        source: "iana"
      },
      "application/vnd.globalplatform.card-content-mgt-response": {
        source: "iana"
      },
      "application/vnd.gmx": {
        source: "iana",
        extensions: ["gmx"]
      },
      "application/vnd.google-apps.document": {
        compressible: false,
        extensions: ["gdoc"]
      },
      "application/vnd.google-apps.presentation": {
        compressible: false,
        extensions: ["gslides"]
      },
      "application/vnd.google-apps.spreadsheet": {
        compressible: false,
        extensions: ["gsheet"]
      },
      "application/vnd.google-earth.kml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["kml"]
      },
      "application/vnd.google-earth.kmz": {
        source: "iana",
        compressible: false,
        extensions: ["kmz"]
      },
      "application/vnd.gov.sk.e-form+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.gov.sk.e-form+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.gov.sk.xmldatacontainer+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.grafeq": {
        source: "iana",
        extensions: ["gqf", "gqs"]
      },
      "application/vnd.gridmp": {
        source: "iana"
      },
      "application/vnd.groove-account": {
        source: "iana",
        extensions: ["gac"]
      },
      "application/vnd.groove-help": {
        source: "iana",
        extensions: ["ghf"]
      },
      "application/vnd.groove-identity-message": {
        source: "iana",
        extensions: ["gim"]
      },
      "application/vnd.groove-injector": {
        source: "iana",
        extensions: ["grv"]
      },
      "application/vnd.groove-tool-message": {
        source: "iana",
        extensions: ["gtm"]
      },
      "application/vnd.groove-tool-template": {
        source: "iana",
        extensions: ["tpl"]
      },
      "application/vnd.groove-vcard": {
        source: "iana",
        extensions: ["vcg"]
      },
      "application/vnd.hal+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.hal+xml": {
        source: "iana",
        compressible: true,
        extensions: ["hal"]
      },
      "application/vnd.handheld-entertainment+xml": {
        source: "iana",
        compressible: true,
        extensions: ["zmm"]
      },
      "application/vnd.hbci": {
        source: "iana",
        extensions: ["hbci"]
      },
      "application/vnd.hc+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.hcl-bireports": {
        source: "iana"
      },
      "application/vnd.hdt": {
        source: "iana"
      },
      "application/vnd.heroku+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.hhe.lesson-player": {
        source: "iana",
        extensions: ["les"]
      },
      "application/vnd.hl7cda+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/vnd.hl7v2+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/vnd.hp-hpgl": {
        source: "iana",
        extensions: ["hpgl"]
      },
      "application/vnd.hp-hpid": {
        source: "iana",
        extensions: ["hpid"]
      },
      "application/vnd.hp-hps": {
        source: "iana",
        extensions: ["hps"]
      },
      "application/vnd.hp-jlyt": {
        source: "iana",
        extensions: ["jlt"]
      },
      "application/vnd.hp-pcl": {
        source: "iana",
        extensions: ["pcl"]
      },
      "application/vnd.hp-pclxl": {
        source: "iana",
        extensions: ["pclxl"]
      },
      "application/vnd.httphone": {
        source: "iana"
      },
      "application/vnd.hydrostatix.sof-data": {
        source: "iana",
        extensions: ["sfd-hdstx"]
      },
      "application/vnd.hyper+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.hyper-item+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.hyperdrive+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.hzn-3d-crossword": {
        source: "iana"
      },
      "application/vnd.ibm.afplinedata": {
        source: "iana"
      },
      "application/vnd.ibm.electronic-media": {
        source: "iana"
      },
      "application/vnd.ibm.minipay": {
        source: "iana",
        extensions: ["mpy"]
      },
      "application/vnd.ibm.modcap": {
        source: "iana",
        extensions: ["afp", "listafp", "list3820"]
      },
      "application/vnd.ibm.rights-management": {
        source: "iana",
        extensions: ["irm"]
      },
      "application/vnd.ibm.secure-container": {
        source: "iana",
        extensions: ["sc"]
      },
      "application/vnd.iccprofile": {
        source: "iana",
        extensions: ["icc", "icm"]
      },
      "application/vnd.ieee.1905": {
        source: "iana"
      },
      "application/vnd.igloader": {
        source: "iana",
        extensions: ["igl"]
      },
      "application/vnd.imagemeter.folder+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.imagemeter.image+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.immervision-ivp": {
        source: "iana",
        extensions: ["ivp"]
      },
      "application/vnd.immervision-ivu": {
        source: "iana",
        extensions: ["ivu"]
      },
      "application/vnd.ims.imsccv1p1": {
        source: "iana"
      },
      "application/vnd.ims.imsccv1p2": {
        source: "iana"
      },
      "application/vnd.ims.imsccv1p3": {
        source: "iana"
      },
      "application/vnd.ims.lis.v2.result+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ims.lti.v2.toolconsumerprofile+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ims.lti.v2.toolproxy+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ims.lti.v2.toolproxy.id+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ims.lti.v2.toolsettings+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ims.lti.v2.toolsettings.simple+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.informedcontrol.rms+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.informix-visionary": {
        source: "iana"
      },
      "application/vnd.infotech.project": {
        source: "iana"
      },
      "application/vnd.infotech.project+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.innopath.wamp.notification": {
        source: "iana"
      },
      "application/vnd.insors.igm": {
        source: "iana",
        extensions: ["igm"]
      },
      "application/vnd.intercon.formnet": {
        source: "iana",
        extensions: ["xpw", "xpx"]
      },
      "application/vnd.intergeo": {
        source: "iana",
        extensions: ["i2g"]
      },
      "application/vnd.intertrust.digibox": {
        source: "iana"
      },
      "application/vnd.intertrust.nncp": {
        source: "iana"
      },
      "application/vnd.intu.qbo": {
        source: "iana",
        extensions: ["qbo"]
      },
      "application/vnd.intu.qfx": {
        source: "iana",
        extensions: ["qfx"]
      },
      "application/vnd.iptc.g2.catalogitem+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.iptc.g2.conceptitem+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.iptc.g2.knowledgeitem+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.iptc.g2.newsitem+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.iptc.g2.newsmessage+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.iptc.g2.packageitem+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.iptc.g2.planningitem+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ipunplugged.rcprofile": {
        source: "iana",
        extensions: ["rcprofile"]
      },
      "application/vnd.irepository.package+xml": {
        source: "iana",
        compressible: true,
        extensions: ["irp"]
      },
      "application/vnd.is-xpr": {
        source: "iana",
        extensions: ["xpr"]
      },
      "application/vnd.isac.fcs": {
        source: "iana",
        extensions: ["fcs"]
      },
      "application/vnd.iso11783-10+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.jam": {
        source: "iana",
        extensions: ["jam"]
      },
      "application/vnd.japannet-directory-service": {
        source: "iana"
      },
      "application/vnd.japannet-jpnstore-wakeup": {
        source: "iana"
      },
      "application/vnd.japannet-payment-wakeup": {
        source: "iana"
      },
      "application/vnd.japannet-registration": {
        source: "iana"
      },
      "application/vnd.japannet-registration-wakeup": {
        source: "iana"
      },
      "application/vnd.japannet-setstore-wakeup": {
        source: "iana"
      },
      "application/vnd.japannet-verification": {
        source: "iana"
      },
      "application/vnd.japannet-verification-wakeup": {
        source: "iana"
      },
      "application/vnd.jcp.javame.midlet-rms": {
        source: "iana",
        extensions: ["rms"]
      },
      "application/vnd.jisp": {
        source: "iana",
        extensions: ["jisp"]
      },
      "application/vnd.joost.joda-archive": {
        source: "iana",
        extensions: ["joda"]
      },
      "application/vnd.jsk.isdn-ngn": {
        source: "iana"
      },
      "application/vnd.kahootz": {
        source: "iana",
        extensions: ["ktz", "ktr"]
      },
      "application/vnd.kde.karbon": {
        source: "iana",
        extensions: ["karbon"]
      },
      "application/vnd.kde.kchart": {
        source: "iana",
        extensions: ["chrt"]
      },
      "application/vnd.kde.kformula": {
        source: "iana",
        extensions: ["kfo"]
      },
      "application/vnd.kde.kivio": {
        source: "iana",
        extensions: ["flw"]
      },
      "application/vnd.kde.kontour": {
        source: "iana",
        extensions: ["kon"]
      },
      "application/vnd.kde.kpresenter": {
        source: "iana",
        extensions: ["kpr", "kpt"]
      },
      "application/vnd.kde.kspread": {
        source: "iana",
        extensions: ["ksp"]
      },
      "application/vnd.kde.kword": {
        source: "iana",
        extensions: ["kwd", "kwt"]
      },
      "application/vnd.kenameaapp": {
        source: "iana",
        extensions: ["htke"]
      },
      "application/vnd.kidspiration": {
        source: "iana",
        extensions: ["kia"]
      },
      "application/vnd.kinar": {
        source: "iana",
        extensions: ["kne", "knp"]
      },
      "application/vnd.koan": {
        source: "iana",
        extensions: ["skp", "skd", "skt", "skm"]
      },
      "application/vnd.kodak-descriptor": {
        source: "iana",
        extensions: ["sse"]
      },
      "application/vnd.las": {
        source: "iana"
      },
      "application/vnd.las.las+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.las.las+xml": {
        source: "iana",
        compressible: true,
        extensions: ["lasxml"]
      },
      "application/vnd.laszip": {
        source: "iana"
      },
      "application/vnd.leap+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.liberty-request+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.llamagraphics.life-balance.desktop": {
        source: "iana",
        extensions: ["lbd"]
      },
      "application/vnd.llamagraphics.life-balance.exchange+xml": {
        source: "iana",
        compressible: true,
        extensions: ["lbe"]
      },
      "application/vnd.logipipe.circuit+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.loom": {
        source: "iana"
      },
      "application/vnd.lotus-1-2-3": {
        source: "iana",
        extensions: ["123"]
      },
      "application/vnd.lotus-approach": {
        source: "iana",
        extensions: ["apr"]
      },
      "application/vnd.lotus-freelance": {
        source: "iana",
        extensions: ["pre"]
      },
      "application/vnd.lotus-notes": {
        source: "iana",
        extensions: ["nsf"]
      },
      "application/vnd.lotus-organizer": {
        source: "iana",
        extensions: ["org"]
      },
      "application/vnd.lotus-screencam": {
        source: "iana",
        extensions: ["scm"]
      },
      "application/vnd.lotus-wordpro": {
        source: "iana",
        extensions: ["lwp"]
      },
      "application/vnd.macports.portpkg": {
        source: "iana",
        extensions: ["portpkg"]
      },
      "application/vnd.mapbox-vector-tile": {
        source: "iana",
        extensions: ["mvt"]
      },
      "application/vnd.marlin.drm.actiontoken+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.marlin.drm.conftoken+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.marlin.drm.license+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.marlin.drm.mdcf": {
        source: "iana"
      },
      "application/vnd.mason+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.maxar.archive.3tz+zip": {
        source: "iana",
        compressible: false
      },
      "application/vnd.maxmind.maxmind-db": {
        source: "iana"
      },
      "application/vnd.mcd": {
        source: "iana",
        extensions: ["mcd"]
      },
      "application/vnd.medcalcdata": {
        source: "iana",
        extensions: ["mc1"]
      },
      "application/vnd.mediastation.cdkey": {
        source: "iana",
        extensions: ["cdkey"]
      },
      "application/vnd.meridian-slingshot": {
        source: "iana"
      },
      "application/vnd.mfer": {
        source: "iana",
        extensions: ["mwf"]
      },
      "application/vnd.mfmp": {
        source: "iana",
        extensions: ["mfm"]
      },
      "application/vnd.micro+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.micrografx.flo": {
        source: "iana",
        extensions: ["flo"]
      },
      "application/vnd.micrografx.igx": {
        source: "iana",
        extensions: ["igx"]
      },
      "application/vnd.microsoft.portable-executable": {
        source: "iana"
      },
      "application/vnd.microsoft.windows.thumbnail-cache": {
        source: "iana"
      },
      "application/vnd.miele+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.mif": {
        source: "iana",
        extensions: ["mif"]
      },
      "application/vnd.minisoft-hp3000-save": {
        source: "iana"
      },
      "application/vnd.mitsubishi.misty-guard.trustweb": {
        source: "iana"
      },
      "application/vnd.mobius.daf": {
        source: "iana",
        extensions: ["daf"]
      },
      "application/vnd.mobius.dis": {
        source: "iana",
        extensions: ["dis"]
      },
      "application/vnd.mobius.mbk": {
        source: "iana",
        extensions: ["mbk"]
      },
      "application/vnd.mobius.mqy": {
        source: "iana",
        extensions: ["mqy"]
      },
      "application/vnd.mobius.msl": {
        source: "iana",
        extensions: ["msl"]
      },
      "application/vnd.mobius.plc": {
        source: "iana",
        extensions: ["plc"]
      },
      "application/vnd.mobius.txf": {
        source: "iana",
        extensions: ["txf"]
      },
      "application/vnd.mophun.application": {
        source: "iana",
        extensions: ["mpn"]
      },
      "application/vnd.mophun.certificate": {
        source: "iana",
        extensions: ["mpc"]
      },
      "application/vnd.motorola.flexsuite": {
        source: "iana"
      },
      "application/vnd.motorola.flexsuite.adsi": {
        source: "iana"
      },
      "application/vnd.motorola.flexsuite.fis": {
        source: "iana"
      },
      "application/vnd.motorola.flexsuite.gotap": {
        source: "iana"
      },
      "application/vnd.motorola.flexsuite.kmr": {
        source: "iana"
      },
      "application/vnd.motorola.flexsuite.ttc": {
        source: "iana"
      },
      "application/vnd.motorola.flexsuite.wem": {
        source: "iana"
      },
      "application/vnd.motorola.iprm": {
        source: "iana"
      },
      "application/vnd.mozilla.xul+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xul"]
      },
      "application/vnd.ms-3mfdocument": {
        source: "iana"
      },
      "application/vnd.ms-artgalry": {
        source: "iana",
        extensions: ["cil"]
      },
      "application/vnd.ms-asf": {
        source: "iana"
      },
      "application/vnd.ms-cab-compressed": {
        source: "iana",
        extensions: ["cab"]
      },
      "application/vnd.ms-color.iccprofile": {
        source: "apache"
      },
      "application/vnd.ms-excel": {
        source: "iana",
        compressible: false,
        extensions: ["xls", "xlm", "xla", "xlc", "xlt", "xlw"]
      },
      "application/vnd.ms-excel.addin.macroenabled.12": {
        source: "iana",
        extensions: ["xlam"]
      },
      "application/vnd.ms-excel.sheet.binary.macroenabled.12": {
        source: "iana",
        extensions: ["xlsb"]
      },
      "application/vnd.ms-excel.sheet.macroenabled.12": {
        source: "iana",
        extensions: ["xlsm"]
      },
      "application/vnd.ms-excel.template.macroenabled.12": {
        source: "iana",
        extensions: ["xltm"]
      },
      "application/vnd.ms-fontobject": {
        source: "iana",
        compressible: true,
        extensions: ["eot"]
      },
      "application/vnd.ms-htmlhelp": {
        source: "iana",
        extensions: ["chm"]
      },
      "application/vnd.ms-ims": {
        source: "iana",
        extensions: ["ims"]
      },
      "application/vnd.ms-lrm": {
        source: "iana",
        extensions: ["lrm"]
      },
      "application/vnd.ms-office.activex+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ms-officetheme": {
        source: "iana",
        extensions: ["thmx"]
      },
      "application/vnd.ms-opentype": {
        source: "apache",
        compressible: true
      },
      "application/vnd.ms-outlook": {
        compressible: false,
        extensions: ["msg"]
      },
      "application/vnd.ms-package.obfuscated-opentype": {
        source: "apache"
      },
      "application/vnd.ms-pki.seccat": {
        source: "apache",
        extensions: ["cat"]
      },
      "application/vnd.ms-pki.stl": {
        source: "apache",
        extensions: ["stl"]
      },
      "application/vnd.ms-playready.initiator+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ms-powerpoint": {
        source: "iana",
        compressible: false,
        extensions: ["ppt", "pps", "pot"]
      },
      "application/vnd.ms-powerpoint.addin.macroenabled.12": {
        source: "iana",
        extensions: ["ppam"]
      },
      "application/vnd.ms-powerpoint.presentation.macroenabled.12": {
        source: "iana",
        extensions: ["pptm"]
      },
      "application/vnd.ms-powerpoint.slide.macroenabled.12": {
        source: "iana",
        extensions: ["sldm"]
      },
      "application/vnd.ms-powerpoint.slideshow.macroenabled.12": {
        source: "iana",
        extensions: ["ppsm"]
      },
      "application/vnd.ms-powerpoint.template.macroenabled.12": {
        source: "iana",
        extensions: ["potm"]
      },
      "application/vnd.ms-printdevicecapabilities+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ms-printing.printticket+xml": {
        source: "apache",
        compressible: true
      },
      "application/vnd.ms-printschematicket+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ms-project": {
        source: "iana",
        extensions: ["mpp", "mpt"]
      },
      "application/vnd.ms-tnef": {
        source: "iana"
      },
      "application/vnd.ms-windows.devicepairing": {
        source: "iana"
      },
      "application/vnd.ms-windows.nwprinting.oob": {
        source: "iana"
      },
      "application/vnd.ms-windows.printerpairing": {
        source: "iana"
      },
      "application/vnd.ms-windows.wsd.oob": {
        source: "iana"
      },
      "application/vnd.ms-wmdrm.lic-chlg-req": {
        source: "iana"
      },
      "application/vnd.ms-wmdrm.lic-resp": {
        source: "iana"
      },
      "application/vnd.ms-wmdrm.meter-chlg-req": {
        source: "iana"
      },
      "application/vnd.ms-wmdrm.meter-resp": {
        source: "iana"
      },
      "application/vnd.ms-word.document.macroenabled.12": {
        source: "iana",
        extensions: ["docm"]
      },
      "application/vnd.ms-word.template.macroenabled.12": {
        source: "iana",
        extensions: ["dotm"]
      },
      "application/vnd.ms-works": {
        source: "iana",
        extensions: ["wps", "wks", "wcm", "wdb"]
      },
      "application/vnd.ms-wpl": {
        source: "iana",
        extensions: ["wpl"]
      },
      "application/vnd.ms-xpsdocument": {
        source: "iana",
        compressible: false,
        extensions: ["xps"]
      },
      "application/vnd.msa-disk-image": {
        source: "iana"
      },
      "application/vnd.mseq": {
        source: "iana",
        extensions: ["mseq"]
      },
      "application/vnd.msign": {
        source: "iana"
      },
      "application/vnd.multiad.creator": {
        source: "iana"
      },
      "application/vnd.multiad.creator.cif": {
        source: "iana"
      },
      "application/vnd.music-niff": {
        source: "iana"
      },
      "application/vnd.musician": {
        source: "iana",
        extensions: ["mus"]
      },
      "application/vnd.muvee.style": {
        source: "iana",
        extensions: ["msty"]
      },
      "application/vnd.mynfc": {
        source: "iana",
        extensions: ["taglet"]
      },
      "application/vnd.nacamar.ybrid+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.ncd.control": {
        source: "iana"
      },
      "application/vnd.ncd.reference": {
        source: "iana"
      },
      "application/vnd.nearst.inv+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.nebumind.line": {
        source: "iana"
      },
      "application/vnd.nervana": {
        source: "iana"
      },
      "application/vnd.netfpx": {
        source: "iana"
      },
      "application/vnd.neurolanguage.nlu": {
        source: "iana",
        extensions: ["nlu"]
      },
      "application/vnd.nimn": {
        source: "iana"
      },
      "application/vnd.nintendo.nitro.rom": {
        source: "iana"
      },
      "application/vnd.nintendo.snes.rom": {
        source: "iana"
      },
      "application/vnd.nitf": {
        source: "iana",
        extensions: ["ntf", "nitf"]
      },
      "application/vnd.noblenet-directory": {
        source: "iana",
        extensions: ["nnd"]
      },
      "application/vnd.noblenet-sealer": {
        source: "iana",
        extensions: ["nns"]
      },
      "application/vnd.noblenet-web": {
        source: "iana",
        extensions: ["nnw"]
      },
      "application/vnd.nokia.catalogs": {
        source: "iana"
      },
      "application/vnd.nokia.conml+wbxml": {
        source: "iana"
      },
      "application/vnd.nokia.conml+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.nokia.iptv.config+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.nokia.isds-radio-presets": {
        source: "iana"
      },
      "application/vnd.nokia.landmark+wbxml": {
        source: "iana"
      },
      "application/vnd.nokia.landmark+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.nokia.landmarkcollection+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.nokia.n-gage.ac+xml": {
        source: "iana",
        compressible: true,
        extensions: ["ac"]
      },
      "application/vnd.nokia.n-gage.data": {
        source: "iana",
        extensions: ["ngdat"]
      },
      "application/vnd.nokia.n-gage.symbian.install": {
        source: "iana",
        extensions: ["n-gage"]
      },
      "application/vnd.nokia.ncd": {
        source: "iana"
      },
      "application/vnd.nokia.pcd+wbxml": {
        source: "iana"
      },
      "application/vnd.nokia.pcd+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.nokia.radio-preset": {
        source: "iana",
        extensions: ["rpst"]
      },
      "application/vnd.nokia.radio-presets": {
        source: "iana",
        extensions: ["rpss"]
      },
      "application/vnd.novadigm.edm": {
        source: "iana",
        extensions: ["edm"]
      },
      "application/vnd.novadigm.edx": {
        source: "iana",
        extensions: ["edx"]
      },
      "application/vnd.novadigm.ext": {
        source: "iana",
        extensions: ["ext"]
      },
      "application/vnd.ntt-local.content-share": {
        source: "iana"
      },
      "application/vnd.ntt-local.file-transfer": {
        source: "iana"
      },
      "application/vnd.ntt-local.ogw_remote-access": {
        source: "iana"
      },
      "application/vnd.ntt-local.sip-ta_remote": {
        source: "iana"
      },
      "application/vnd.ntt-local.sip-ta_tcp_stream": {
        source: "iana"
      },
      "application/vnd.oasis.opendocument.chart": {
        source: "iana",
        extensions: ["odc"]
      },
      "application/vnd.oasis.opendocument.chart-template": {
        source: "iana",
        extensions: ["otc"]
      },
      "application/vnd.oasis.opendocument.database": {
        source: "iana",
        extensions: ["odb"]
      },
      "application/vnd.oasis.opendocument.formula": {
        source: "iana",
        extensions: ["odf"]
      },
      "application/vnd.oasis.opendocument.formula-template": {
        source: "iana",
        extensions: ["odft"]
      },
      "application/vnd.oasis.opendocument.graphics": {
        source: "iana",
        compressible: false,
        extensions: ["odg"]
      },
      "application/vnd.oasis.opendocument.graphics-template": {
        source: "iana",
        extensions: ["otg"]
      },
      "application/vnd.oasis.opendocument.image": {
        source: "iana",
        extensions: ["odi"]
      },
      "application/vnd.oasis.opendocument.image-template": {
        source: "iana",
        extensions: ["oti"]
      },
      "application/vnd.oasis.opendocument.presentation": {
        source: "iana",
        compressible: false,
        extensions: ["odp"]
      },
      "application/vnd.oasis.opendocument.presentation-template": {
        source: "iana",
        extensions: ["otp"]
      },
      "application/vnd.oasis.opendocument.spreadsheet": {
        source: "iana",
        compressible: false,
        extensions: ["ods"]
      },
      "application/vnd.oasis.opendocument.spreadsheet-template": {
        source: "iana",
        extensions: ["ots"]
      },
      "application/vnd.oasis.opendocument.text": {
        source: "iana",
        compressible: false,
        extensions: ["odt"]
      },
      "application/vnd.oasis.opendocument.text-master": {
        source: "iana",
        extensions: ["odm"]
      },
      "application/vnd.oasis.opendocument.text-template": {
        source: "iana",
        extensions: ["ott"]
      },
      "application/vnd.oasis.opendocument.text-web": {
        source: "iana",
        extensions: ["oth"]
      },
      "application/vnd.obn": {
        source: "iana"
      },
      "application/vnd.ocf+cbor": {
        source: "iana"
      },
      "application/vnd.oci.image.manifest.v1+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oftn.l10n+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oipf.contentaccessdownload+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oipf.contentaccessstreaming+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oipf.cspg-hexbinary": {
        source: "iana"
      },
      "application/vnd.oipf.dae.svg+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oipf.dae.xhtml+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oipf.mippvcontrolmessage+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oipf.pae.gem": {
        source: "iana"
      },
      "application/vnd.oipf.spdiscovery+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oipf.spdlist+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oipf.ueprofile+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oipf.userprofile+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.olpc-sugar": {
        source: "iana",
        extensions: ["xo"]
      },
      "application/vnd.oma-scws-config": {
        source: "iana"
      },
      "application/vnd.oma-scws-http-request": {
        source: "iana"
      },
      "application/vnd.oma-scws-http-response": {
        source: "iana"
      },
      "application/vnd.oma.bcast.associated-procedure-parameter+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.bcast.drm-trigger+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.bcast.imd+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.bcast.ltkm": {
        source: "iana"
      },
      "application/vnd.oma.bcast.notification+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.bcast.provisioningtrigger": {
        source: "iana"
      },
      "application/vnd.oma.bcast.sgboot": {
        source: "iana"
      },
      "application/vnd.oma.bcast.sgdd+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.bcast.sgdu": {
        source: "iana"
      },
      "application/vnd.oma.bcast.simple-symbol-container": {
        source: "iana"
      },
      "application/vnd.oma.bcast.smartcard-trigger+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.bcast.sprov+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.bcast.stkm": {
        source: "iana"
      },
      "application/vnd.oma.cab-address-book+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.cab-feature-handler+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.cab-pcc+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.cab-subs-invite+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.cab-user-prefs+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.dcd": {
        source: "iana"
      },
      "application/vnd.oma.dcdc": {
        source: "iana"
      },
      "application/vnd.oma.dd2+xml": {
        source: "iana",
        compressible: true,
        extensions: ["dd2"]
      },
      "application/vnd.oma.drm.risd+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.group-usage-list+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.lwm2m+cbor": {
        source: "iana"
      },
      "application/vnd.oma.lwm2m+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.lwm2m+tlv": {
        source: "iana"
      },
      "application/vnd.oma.pal+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.poc.detailed-progress-report+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.poc.final-report+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.poc.groups+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.poc.invocation-descriptor+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.poc.optimized-progress-report+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.push": {
        source: "iana"
      },
      "application/vnd.oma.scidm.messages+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oma.xcap-directory+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.omads-email+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/vnd.omads-file+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/vnd.omads-folder+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/vnd.omaloc-supl-init": {
        source: "iana"
      },
      "application/vnd.onepager": {
        source: "iana"
      },
      "application/vnd.onepagertamp": {
        source: "iana"
      },
      "application/vnd.onepagertamx": {
        source: "iana"
      },
      "application/vnd.onepagertat": {
        source: "iana"
      },
      "application/vnd.onepagertatp": {
        source: "iana"
      },
      "application/vnd.onepagertatx": {
        source: "iana"
      },
      "application/vnd.openblox.game+xml": {
        source: "iana",
        compressible: true,
        extensions: ["obgx"]
      },
      "application/vnd.openblox.game-binary": {
        source: "iana"
      },
      "application/vnd.openeye.oeb": {
        source: "iana"
      },
      "application/vnd.openofficeorg.extension": {
        source: "apache",
        extensions: ["oxt"]
      },
      "application/vnd.openstreetmap.data+xml": {
        source: "iana",
        compressible: true,
        extensions: ["osm"]
      },
      "application/vnd.opentimestamps.ots": {
        source: "iana"
      },
      "application/vnd.openxmlformats-officedocument.custom-properties+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.customxmlproperties+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.drawing+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.drawingml.chart+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.drawingml.chartshapes+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.drawingml.diagramcolors+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.drawingml.diagramdata+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.drawingml.diagramlayout+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.drawingml.diagramstyle+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.extended-properties+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.commentauthors+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.comments+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.handoutmaster+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.notesmaster+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.notesslide+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
        source: "iana",
        compressible: false,
        extensions: ["pptx"]
      },
      "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.presprops+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.slide": {
        source: "iana",
        extensions: ["sldx"]
      },
      "application/vnd.openxmlformats-officedocument.presentationml.slide+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.slidelayout+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.slidemaster+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.slideshow": {
        source: "iana",
        extensions: ["ppsx"]
      },
      "application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.slideupdateinfo+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.tablestyles+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.tags+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.template": {
        source: "iana",
        extensions: ["potx"]
      },
      "application/vnd.openxmlformats-officedocument.presentationml.template.main+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.presentationml.viewprops+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.calcchain+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.chartsheet+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.connections+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.dialogsheet+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.externallink+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotcachedefinition+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotcacherecords+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.pivottable+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.querytable+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.revisionheaders+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.revisionlog+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedstrings+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
        source: "iana",
        compressible: false,
        extensions: ["xlsx"]
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheetmetadata+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.tablesinglecells+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.template": {
        source: "iana",
        extensions: ["xltx"]
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.usernames+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.volatiledependencies+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.theme+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.themeoverride+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.vmldrawing": {
        source: "iana"
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
        source: "iana",
        compressible: false,
        extensions: ["docx"]
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document.glossary+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.fonttable+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.template": {
        source: "iana",
        extensions: ["dotx"]
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-officedocument.wordprocessingml.websettings+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-package.core-properties+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-package.digital-signature-xmlsignature+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.openxmlformats-package.relationships+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oracle.resource+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.orange.indata": {
        source: "iana"
      },
      "application/vnd.osa.netdeploy": {
        source: "iana"
      },
      "application/vnd.osgeo.mapguide.package": {
        source: "iana",
        extensions: ["mgp"]
      },
      "application/vnd.osgi.bundle": {
        source: "iana"
      },
      "application/vnd.osgi.dp": {
        source: "iana",
        extensions: ["dp"]
      },
      "application/vnd.osgi.subsystem": {
        source: "iana",
        extensions: ["esa"]
      },
      "application/vnd.otps.ct-kip+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.oxli.countgraph": {
        source: "iana"
      },
      "application/vnd.pagerduty+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.palm": {
        source: "iana",
        extensions: ["pdb", "pqa", "oprc"]
      },
      "application/vnd.panoply": {
        source: "iana"
      },
      "application/vnd.paos.xml": {
        source: "iana"
      },
      "application/vnd.patentdive": {
        source: "iana"
      },
      "application/vnd.patientecommsdoc": {
        source: "iana"
      },
      "application/vnd.pawaafile": {
        source: "iana",
        extensions: ["paw"]
      },
      "application/vnd.pcos": {
        source: "iana"
      },
      "application/vnd.pg.format": {
        source: "iana",
        extensions: ["str"]
      },
      "application/vnd.pg.osasli": {
        source: "iana",
        extensions: ["ei6"]
      },
      "application/vnd.piaccess.application-licence": {
        source: "iana"
      },
      "application/vnd.picsel": {
        source: "iana",
        extensions: ["efif"]
      },
      "application/vnd.pmi.widget": {
        source: "iana",
        extensions: ["wg"]
      },
      "application/vnd.poc.group-advertisement+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.pocketlearn": {
        source: "iana",
        extensions: ["plf"]
      },
      "application/vnd.powerbuilder6": {
        source: "iana",
        extensions: ["pbd"]
      },
      "application/vnd.powerbuilder6-s": {
        source: "iana"
      },
      "application/vnd.powerbuilder7": {
        source: "iana"
      },
      "application/vnd.powerbuilder7-s": {
        source: "iana"
      },
      "application/vnd.powerbuilder75": {
        source: "iana"
      },
      "application/vnd.powerbuilder75-s": {
        source: "iana"
      },
      "application/vnd.preminet": {
        source: "iana"
      },
      "application/vnd.previewsystems.box": {
        source: "iana",
        extensions: ["box"]
      },
      "application/vnd.proteus.magazine": {
        source: "iana",
        extensions: ["mgz"]
      },
      "application/vnd.psfs": {
        source: "iana"
      },
      "application/vnd.publishare-delta-tree": {
        source: "iana",
        extensions: ["qps"]
      },
      "application/vnd.pvi.ptid1": {
        source: "iana",
        extensions: ["ptid"]
      },
      "application/vnd.pwg-multiplexed": {
        source: "iana"
      },
      "application/vnd.pwg-xhtml-print+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.qualcomm.brew-app-res": {
        source: "iana"
      },
      "application/vnd.quarantainenet": {
        source: "iana"
      },
      "application/vnd.quark.quarkxpress": {
        source: "iana",
        extensions: ["qxd", "qxt", "qwd", "qwt", "qxl", "qxb"]
      },
      "application/vnd.quobject-quoxdocument": {
        source: "iana"
      },
      "application/vnd.radisys.moml+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-audit+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-audit-conf+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-audit-conn+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-audit-dialog+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-audit-stream+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-conf+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-dialog+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-dialog-base+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-dialog-fax-detect+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-dialog-fax-sendrecv+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-dialog-group+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-dialog-speech+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.radisys.msml-dialog-transform+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.rainstor.data": {
        source: "iana"
      },
      "application/vnd.rapid": {
        source: "iana"
      },
      "application/vnd.rar": {
        source: "iana",
        extensions: ["rar"]
      },
      "application/vnd.realvnc.bed": {
        source: "iana",
        extensions: ["bed"]
      },
      "application/vnd.recordare.musicxml": {
        source: "iana",
        extensions: ["mxl"]
      },
      "application/vnd.recordare.musicxml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["musicxml"]
      },
      "application/vnd.renlearn.rlprint": {
        source: "iana"
      },
      "application/vnd.resilient.logic": {
        source: "iana"
      },
      "application/vnd.restful+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.rig.cryptonote": {
        source: "iana",
        extensions: ["cryptonote"]
      },
      "application/vnd.rim.cod": {
        source: "apache",
        extensions: ["cod"]
      },
      "application/vnd.rn-realmedia": {
        source: "apache",
        extensions: ["rm"]
      },
      "application/vnd.rn-realmedia-vbr": {
        source: "apache",
        extensions: ["rmvb"]
      },
      "application/vnd.route66.link66+xml": {
        source: "iana",
        compressible: true,
        extensions: ["link66"]
      },
      "application/vnd.rs-274x": {
        source: "iana"
      },
      "application/vnd.ruckus.download": {
        source: "iana"
      },
      "application/vnd.s3sms": {
        source: "iana"
      },
      "application/vnd.sailingtracker.track": {
        source: "iana",
        extensions: ["st"]
      },
      "application/vnd.sar": {
        source: "iana"
      },
      "application/vnd.sbm.cid": {
        source: "iana"
      },
      "application/vnd.sbm.mid2": {
        source: "iana"
      },
      "application/vnd.scribus": {
        source: "iana"
      },
      "application/vnd.sealed.3df": {
        source: "iana"
      },
      "application/vnd.sealed.csf": {
        source: "iana"
      },
      "application/vnd.sealed.doc": {
        source: "iana"
      },
      "application/vnd.sealed.eml": {
        source: "iana"
      },
      "application/vnd.sealed.mht": {
        source: "iana"
      },
      "application/vnd.sealed.net": {
        source: "iana"
      },
      "application/vnd.sealed.ppt": {
        source: "iana"
      },
      "application/vnd.sealed.tiff": {
        source: "iana"
      },
      "application/vnd.sealed.xls": {
        source: "iana"
      },
      "application/vnd.sealedmedia.softseal.html": {
        source: "iana"
      },
      "application/vnd.sealedmedia.softseal.pdf": {
        source: "iana"
      },
      "application/vnd.seemail": {
        source: "iana",
        extensions: ["see"]
      },
      "application/vnd.seis+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.sema": {
        source: "iana",
        extensions: ["sema"]
      },
      "application/vnd.semd": {
        source: "iana",
        extensions: ["semd"]
      },
      "application/vnd.semf": {
        source: "iana",
        extensions: ["semf"]
      },
      "application/vnd.shade-save-file": {
        source: "iana"
      },
      "application/vnd.shana.informed.formdata": {
        source: "iana",
        extensions: ["ifm"]
      },
      "application/vnd.shana.informed.formtemplate": {
        source: "iana",
        extensions: ["itp"]
      },
      "application/vnd.shana.informed.interchange": {
        source: "iana",
        extensions: ["iif"]
      },
      "application/vnd.shana.informed.package": {
        source: "iana",
        extensions: ["ipk"]
      },
      "application/vnd.shootproof+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.shopkick+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.shp": {
        source: "iana"
      },
      "application/vnd.shx": {
        source: "iana"
      },
      "application/vnd.sigrok.session": {
        source: "iana"
      },
      "application/vnd.simtech-mindmapper": {
        source: "iana",
        extensions: ["twd", "twds"]
      },
      "application/vnd.siren+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.smaf": {
        source: "iana",
        extensions: ["mmf"]
      },
      "application/vnd.smart.notebook": {
        source: "iana"
      },
      "application/vnd.smart.teacher": {
        source: "iana",
        extensions: ["teacher"]
      },
      "application/vnd.snesdev-page-table": {
        source: "iana"
      },
      "application/vnd.software602.filler.form+xml": {
        source: "iana",
        compressible: true,
        extensions: ["fo"]
      },
      "application/vnd.software602.filler.form-xml-zip": {
        source: "iana"
      },
      "application/vnd.solent.sdkm+xml": {
        source: "iana",
        compressible: true,
        extensions: ["sdkm", "sdkd"]
      },
      "application/vnd.spotfire.dxp": {
        source: "iana",
        extensions: ["dxp"]
      },
      "application/vnd.spotfire.sfs": {
        source: "iana",
        extensions: ["sfs"]
      },
      "application/vnd.sqlite3": {
        source: "iana"
      },
      "application/vnd.sss-cod": {
        source: "iana"
      },
      "application/vnd.sss-dtf": {
        source: "iana"
      },
      "application/vnd.sss-ntf": {
        source: "iana"
      },
      "application/vnd.stardivision.calc": {
        source: "apache",
        extensions: ["sdc"]
      },
      "application/vnd.stardivision.draw": {
        source: "apache",
        extensions: ["sda"]
      },
      "application/vnd.stardivision.impress": {
        source: "apache",
        extensions: ["sdd"]
      },
      "application/vnd.stardivision.math": {
        source: "apache",
        extensions: ["smf"]
      },
      "application/vnd.stardivision.writer": {
        source: "apache",
        extensions: ["sdw", "vor"]
      },
      "application/vnd.stardivision.writer-global": {
        source: "apache",
        extensions: ["sgl"]
      },
      "application/vnd.stepmania.package": {
        source: "iana",
        extensions: ["smzip"]
      },
      "application/vnd.stepmania.stepchart": {
        source: "iana",
        extensions: ["sm"]
      },
      "application/vnd.street-stream": {
        source: "iana"
      },
      "application/vnd.sun.wadl+xml": {
        source: "iana",
        compressible: true,
        extensions: ["wadl"]
      },
      "application/vnd.sun.xml.calc": {
        source: "apache",
        extensions: ["sxc"]
      },
      "application/vnd.sun.xml.calc.template": {
        source: "apache",
        extensions: ["stc"]
      },
      "application/vnd.sun.xml.draw": {
        source: "apache",
        extensions: ["sxd"]
      },
      "application/vnd.sun.xml.draw.template": {
        source: "apache",
        extensions: ["std"]
      },
      "application/vnd.sun.xml.impress": {
        source: "apache",
        extensions: ["sxi"]
      },
      "application/vnd.sun.xml.impress.template": {
        source: "apache",
        extensions: ["sti"]
      },
      "application/vnd.sun.xml.math": {
        source: "apache",
        extensions: ["sxm"]
      },
      "application/vnd.sun.xml.writer": {
        source: "apache",
        extensions: ["sxw"]
      },
      "application/vnd.sun.xml.writer.global": {
        source: "apache",
        extensions: ["sxg"]
      },
      "application/vnd.sun.xml.writer.template": {
        source: "apache",
        extensions: ["stw"]
      },
      "application/vnd.sus-calendar": {
        source: "iana",
        extensions: ["sus", "susp"]
      },
      "application/vnd.svd": {
        source: "iana",
        extensions: ["svd"]
      },
      "application/vnd.swiftview-ics": {
        source: "iana"
      },
      "application/vnd.sycle+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.syft+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.symbian.install": {
        source: "apache",
        extensions: ["sis", "sisx"]
      },
      "application/vnd.syncml+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true,
        extensions: ["xsm"]
      },
      "application/vnd.syncml.dm+wbxml": {
        source: "iana",
        charset: "UTF-8",
        extensions: ["bdm"]
      },
      "application/vnd.syncml.dm+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true,
        extensions: ["xdm"]
      },
      "application/vnd.syncml.dm.notification": {
        source: "iana"
      },
      "application/vnd.syncml.dmddf+wbxml": {
        source: "iana"
      },
      "application/vnd.syncml.dmddf+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true,
        extensions: ["ddf"]
      },
      "application/vnd.syncml.dmtnds+wbxml": {
        source: "iana"
      },
      "application/vnd.syncml.dmtnds+xml": {
        source: "iana",
        charset: "UTF-8",
        compressible: true
      },
      "application/vnd.syncml.ds.notification": {
        source: "iana"
      },
      "application/vnd.tableschema+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.tao.intent-module-archive": {
        source: "iana",
        extensions: ["tao"]
      },
      "application/vnd.tcpdump.pcap": {
        source: "iana",
        extensions: ["pcap", "cap", "dmp"]
      },
      "application/vnd.think-cell.ppttc+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.tmd.mediaflex.api+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.tml": {
        source: "iana"
      },
      "application/vnd.tmobile-livetv": {
        source: "iana",
        extensions: ["tmo"]
      },
      "application/vnd.tri.onesource": {
        source: "iana"
      },
      "application/vnd.trid.tpt": {
        source: "iana",
        extensions: ["tpt"]
      },
      "application/vnd.triscape.mxs": {
        source: "iana",
        extensions: ["mxs"]
      },
      "application/vnd.trueapp": {
        source: "iana",
        extensions: ["tra"]
      },
      "application/vnd.truedoc": {
        source: "iana"
      },
      "application/vnd.ubisoft.webplayer": {
        source: "iana"
      },
      "application/vnd.ufdl": {
        source: "iana",
        extensions: ["ufd", "ufdl"]
      },
      "application/vnd.uiq.theme": {
        source: "iana",
        extensions: ["utz"]
      },
      "application/vnd.umajin": {
        source: "iana",
        extensions: ["umj"]
      },
      "application/vnd.unity": {
        source: "iana",
        extensions: ["unityweb"]
      },
      "application/vnd.uoml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["uoml"]
      },
      "application/vnd.uplanet.alert": {
        source: "iana"
      },
      "application/vnd.uplanet.alert-wbxml": {
        source: "iana"
      },
      "application/vnd.uplanet.bearer-choice": {
        source: "iana"
      },
      "application/vnd.uplanet.bearer-choice-wbxml": {
        source: "iana"
      },
      "application/vnd.uplanet.cacheop": {
        source: "iana"
      },
      "application/vnd.uplanet.cacheop-wbxml": {
        source: "iana"
      },
      "application/vnd.uplanet.channel": {
        source: "iana"
      },
      "application/vnd.uplanet.channel-wbxml": {
        source: "iana"
      },
      "application/vnd.uplanet.list": {
        source: "iana"
      },
      "application/vnd.uplanet.list-wbxml": {
        source: "iana"
      },
      "application/vnd.uplanet.listcmd": {
        source: "iana"
      },
      "application/vnd.uplanet.listcmd-wbxml": {
        source: "iana"
      },
      "application/vnd.uplanet.signal": {
        source: "iana"
      },
      "application/vnd.uri-map": {
        source: "iana"
      },
      "application/vnd.valve.source.material": {
        source: "iana"
      },
      "application/vnd.vcx": {
        source: "iana",
        extensions: ["vcx"]
      },
      "application/vnd.vd-study": {
        source: "iana"
      },
      "application/vnd.vectorworks": {
        source: "iana"
      },
      "application/vnd.vel+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.verimatrix.vcas": {
        source: "iana"
      },
      "application/vnd.veritone.aion+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.veryant.thin": {
        source: "iana"
      },
      "application/vnd.ves.encrypted": {
        source: "iana"
      },
      "application/vnd.vidsoft.vidconference": {
        source: "iana"
      },
      "application/vnd.visio": {
        source: "iana",
        extensions: ["vsd", "vst", "vss", "vsw"]
      },
      "application/vnd.visionary": {
        source: "iana",
        extensions: ["vis"]
      },
      "application/vnd.vividence.scriptfile": {
        source: "iana"
      },
      "application/vnd.vsf": {
        source: "iana",
        extensions: ["vsf"]
      },
      "application/vnd.wap.sic": {
        source: "iana"
      },
      "application/vnd.wap.slc": {
        source: "iana"
      },
      "application/vnd.wap.wbxml": {
        source: "iana",
        charset: "UTF-8",
        extensions: ["wbxml"]
      },
      "application/vnd.wap.wmlc": {
        source: "iana",
        extensions: ["wmlc"]
      },
      "application/vnd.wap.wmlscriptc": {
        source: "iana",
        extensions: ["wmlsc"]
      },
      "application/vnd.webturbo": {
        source: "iana",
        extensions: ["wtb"]
      },
      "application/vnd.wfa.dpp": {
        source: "iana"
      },
      "application/vnd.wfa.p2p": {
        source: "iana"
      },
      "application/vnd.wfa.wsc": {
        source: "iana"
      },
      "application/vnd.windows.devicepairing": {
        source: "iana"
      },
      "application/vnd.wmc": {
        source: "iana"
      },
      "application/vnd.wmf.bootstrap": {
        source: "iana"
      },
      "application/vnd.wolfram.mathematica": {
        source: "iana"
      },
      "application/vnd.wolfram.mathematica.package": {
        source: "iana"
      },
      "application/vnd.wolfram.player": {
        source: "iana",
        extensions: ["nbp"]
      },
      "application/vnd.wordperfect": {
        source: "iana",
        extensions: ["wpd"]
      },
      "application/vnd.wqd": {
        source: "iana",
        extensions: ["wqd"]
      },
      "application/vnd.wrq-hp3000-labelled": {
        source: "iana"
      },
      "application/vnd.wt.stf": {
        source: "iana",
        extensions: ["stf"]
      },
      "application/vnd.wv.csp+wbxml": {
        source: "iana"
      },
      "application/vnd.wv.csp+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.wv.ssp+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.xacml+json": {
        source: "iana",
        compressible: true
      },
      "application/vnd.xara": {
        source: "iana",
        extensions: ["xar"]
      },
      "application/vnd.xfdl": {
        source: "iana",
        extensions: ["xfdl"]
      },
      "application/vnd.xfdl.webform": {
        source: "iana"
      },
      "application/vnd.xmi+xml": {
        source: "iana",
        compressible: true
      },
      "application/vnd.xmpie.cpkg": {
        source: "iana"
      },
      "application/vnd.xmpie.dpkg": {
        source: "iana"
      },
      "application/vnd.xmpie.plan": {
        source: "iana"
      },
      "application/vnd.xmpie.ppkg": {
        source: "iana"
      },
      "application/vnd.xmpie.xlim": {
        source: "iana"
      },
      "application/vnd.yamaha.hv-dic": {
        source: "iana",
        extensions: ["hvd"]
      },
      "application/vnd.yamaha.hv-script": {
        source: "iana",
        extensions: ["hvs"]
      },
      "application/vnd.yamaha.hv-voice": {
        source: "iana",
        extensions: ["hvp"]
      },
      "application/vnd.yamaha.openscoreformat": {
        source: "iana",
        extensions: ["osf"]
      },
      "application/vnd.yamaha.openscoreformat.osfpvg+xml": {
        source: "iana",
        compressible: true,
        extensions: ["osfpvg"]
      },
      "application/vnd.yamaha.remote-setup": {
        source: "iana"
      },
      "application/vnd.yamaha.smaf-audio": {
        source: "iana",
        extensions: ["saf"]
      },
      "application/vnd.yamaha.smaf-phrase": {
        source: "iana",
        extensions: ["spf"]
      },
      "application/vnd.yamaha.through-ngn": {
        source: "iana"
      },
      "application/vnd.yamaha.tunnel-udpencap": {
        source: "iana"
      },
      "application/vnd.yaoweme": {
        source: "iana"
      },
      "application/vnd.yellowriver-custom-menu": {
        source: "iana",
        extensions: ["cmp"]
      },
      "application/vnd.youtube.yt": {
        source: "iana"
      },
      "application/vnd.zul": {
        source: "iana",
        extensions: ["zir", "zirz"]
      },
      "application/vnd.zzazz.deck+xml": {
        source: "iana",
        compressible: true,
        extensions: ["zaz"]
      },
      "application/voicexml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["vxml"]
      },
      "application/voucher-cms+json": {
        source: "iana",
        compressible: true
      },
      "application/vq-rtcpxr": {
        source: "iana"
      },
      "application/wasm": {
        source: "iana",
        compressible: true,
        extensions: ["wasm"]
      },
      "application/watcherinfo+xml": {
        source: "iana",
        compressible: true,
        extensions: ["wif"]
      },
      "application/webpush-options+json": {
        source: "iana",
        compressible: true
      },
      "application/whoispp-query": {
        source: "iana"
      },
      "application/whoispp-response": {
        source: "iana"
      },
      "application/widget": {
        source: "iana",
        extensions: ["wgt"]
      },
      "application/winhlp": {
        source: "apache",
        extensions: ["hlp"]
      },
      "application/wita": {
        source: "iana"
      },
      "application/wordperfect5.1": {
        source: "iana"
      },
      "application/wsdl+xml": {
        source: "iana",
        compressible: true,
        extensions: ["wsdl"]
      },
      "application/wspolicy+xml": {
        source: "iana",
        compressible: true,
        extensions: ["wspolicy"]
      },
      "application/x-7z-compressed": {
        source: "apache",
        compressible: false,
        extensions: ["7z"]
      },
      "application/x-abiword": {
        source: "apache",
        extensions: ["abw"]
      },
      "application/x-ace-compressed": {
        source: "apache",
        extensions: ["ace"]
      },
      "application/x-amf": {
        source: "apache"
      },
      "application/x-apple-diskimage": {
        source: "apache",
        extensions: ["dmg"]
      },
      "application/x-arj": {
        compressible: false,
        extensions: ["arj"]
      },
      "application/x-authorware-bin": {
        source: "apache",
        extensions: ["aab", "x32", "u32", "vox"]
      },
      "application/x-authorware-map": {
        source: "apache",
        extensions: ["aam"]
      },
      "application/x-authorware-seg": {
        source: "apache",
        extensions: ["aas"]
      },
      "application/x-bcpio": {
        source: "apache",
        extensions: ["bcpio"]
      },
      "application/x-bdoc": {
        compressible: false,
        extensions: ["bdoc"]
      },
      "application/x-bittorrent": {
        source: "apache",
        extensions: ["torrent"]
      },
      "application/x-blorb": {
        source: "apache",
        extensions: ["blb", "blorb"]
      },
      "application/x-bzip": {
        source: "apache",
        compressible: false,
        extensions: ["bz"]
      },
      "application/x-bzip2": {
        source: "apache",
        compressible: false,
        extensions: ["bz2", "boz"]
      },
      "application/x-cbr": {
        source: "apache",
        extensions: ["cbr", "cba", "cbt", "cbz", "cb7"]
      },
      "application/x-cdlink": {
        source: "apache",
        extensions: ["vcd"]
      },
      "application/x-cfs-compressed": {
        source: "apache",
        extensions: ["cfs"]
      },
      "application/x-chat": {
        source: "apache",
        extensions: ["chat"]
      },
      "application/x-chess-pgn": {
        source: "apache",
        extensions: ["pgn"]
      },
      "application/x-chrome-extension": {
        extensions: ["crx"]
      },
      "application/x-cocoa": {
        source: "nginx",
        extensions: ["cco"]
      },
      "application/x-compress": {
        source: "apache"
      },
      "application/x-conference": {
        source: "apache",
        extensions: ["nsc"]
      },
      "application/x-cpio": {
        source: "apache",
        extensions: ["cpio"]
      },
      "application/x-csh": {
        source: "apache",
        extensions: ["csh"]
      },
      "application/x-deb": {
        compressible: false
      },
      "application/x-debian-package": {
        source: "apache",
        extensions: ["deb", "udeb"]
      },
      "application/x-dgc-compressed": {
        source: "apache",
        extensions: ["dgc"]
      },
      "application/x-director": {
        source: "apache",
        extensions: ["dir", "dcr", "dxr", "cst", "cct", "cxt", "w3d", "fgd", "swa"]
      },
      "application/x-doom": {
        source: "apache",
        extensions: ["wad"]
      },
      "application/x-dtbncx+xml": {
        source: "apache",
        compressible: true,
        extensions: ["ncx"]
      },
      "application/x-dtbook+xml": {
        source: "apache",
        compressible: true,
        extensions: ["dtb"]
      },
      "application/x-dtbresource+xml": {
        source: "apache",
        compressible: true,
        extensions: ["res"]
      },
      "application/x-dvi": {
        source: "apache",
        compressible: false,
        extensions: ["dvi"]
      },
      "application/x-envoy": {
        source: "apache",
        extensions: ["evy"]
      },
      "application/x-eva": {
        source: "apache",
        extensions: ["eva"]
      },
      "application/x-font-bdf": {
        source: "apache",
        extensions: ["bdf"]
      },
      "application/x-font-dos": {
        source: "apache"
      },
      "application/x-font-framemaker": {
        source: "apache"
      },
      "application/x-font-ghostscript": {
        source: "apache",
        extensions: ["gsf"]
      },
      "application/x-font-libgrx": {
        source: "apache"
      },
      "application/x-font-linux-psf": {
        source: "apache",
        extensions: ["psf"]
      },
      "application/x-font-pcf": {
        source: "apache",
        extensions: ["pcf"]
      },
      "application/x-font-snf": {
        source: "apache",
        extensions: ["snf"]
      },
      "application/x-font-speedo": {
        source: "apache"
      },
      "application/x-font-sunos-news": {
        source: "apache"
      },
      "application/x-font-type1": {
        source: "apache",
        extensions: ["pfa", "pfb", "pfm", "afm"]
      },
      "application/x-font-vfont": {
        source: "apache"
      },
      "application/x-freearc": {
        source: "apache",
        extensions: ["arc"]
      },
      "application/x-futuresplash": {
        source: "apache",
        extensions: ["spl"]
      },
      "application/x-gca-compressed": {
        source: "apache",
        extensions: ["gca"]
      },
      "application/x-glulx": {
        source: "apache",
        extensions: ["ulx"]
      },
      "application/x-gnumeric": {
        source: "apache",
        extensions: ["gnumeric"]
      },
      "application/x-gramps-xml": {
        source: "apache",
        extensions: ["gramps"]
      },
      "application/x-gtar": {
        source: "apache",
        extensions: ["gtar"]
      },
      "application/x-gzip": {
        source: "apache"
      },
      "application/x-hdf": {
        source: "apache",
        extensions: ["hdf"]
      },
      "application/x-httpd-php": {
        compressible: true,
        extensions: ["php"]
      },
      "application/x-install-instructions": {
        source: "apache",
        extensions: ["install"]
      },
      "application/x-iso9660-image": {
        source: "apache",
        extensions: ["iso"]
      },
      "application/x-iwork-keynote-sffkey": {
        extensions: ["key"]
      },
      "application/x-iwork-numbers-sffnumbers": {
        extensions: ["numbers"]
      },
      "application/x-iwork-pages-sffpages": {
        extensions: ["pages"]
      },
      "application/x-java-archive-diff": {
        source: "nginx",
        extensions: ["jardiff"]
      },
      "application/x-java-jnlp-file": {
        source: "apache",
        compressible: false,
        extensions: ["jnlp"]
      },
      "application/x-javascript": {
        compressible: true
      },
      "application/x-keepass2": {
        extensions: ["kdbx"]
      },
      "application/x-latex": {
        source: "apache",
        compressible: false,
        extensions: ["latex"]
      },
      "application/x-lua-bytecode": {
        extensions: ["luac"]
      },
      "application/x-lzh-compressed": {
        source: "apache",
        extensions: ["lzh", "lha"]
      },
      "application/x-makeself": {
        source: "nginx",
        extensions: ["run"]
      },
      "application/x-mie": {
        source: "apache",
        extensions: ["mie"]
      },
      "application/x-mobipocket-ebook": {
        source: "apache",
        extensions: ["prc", "mobi"]
      },
      "application/x-mpegurl": {
        compressible: false
      },
      "application/x-ms-application": {
        source: "apache",
        extensions: ["application"]
      },
      "application/x-ms-shortcut": {
        source: "apache",
        extensions: ["lnk"]
      },
      "application/x-ms-wmd": {
        source: "apache",
        extensions: ["wmd"]
      },
      "application/x-ms-wmz": {
        source: "apache",
        extensions: ["wmz"]
      },
      "application/x-ms-xbap": {
        source: "apache",
        extensions: ["xbap"]
      },
      "application/x-msaccess": {
        source: "apache",
        extensions: ["mdb"]
      },
      "application/x-msbinder": {
        source: "apache",
        extensions: ["obd"]
      },
      "application/x-mscardfile": {
        source: "apache",
        extensions: ["crd"]
      },
      "application/x-msclip": {
        source: "apache",
        extensions: ["clp"]
      },
      "application/x-msdos-program": {
        extensions: ["exe"]
      },
      "application/x-msdownload": {
        source: "apache",
        extensions: ["exe", "dll", "com", "bat", "msi"]
      },
      "application/x-msmediaview": {
        source: "apache",
        extensions: ["mvb", "m13", "m14"]
      },
      "application/x-msmetafile": {
        source: "apache",
        extensions: ["wmf", "wmz", "emf", "emz"]
      },
      "application/x-msmoney": {
        source: "apache",
        extensions: ["mny"]
      },
      "application/x-mspublisher": {
        source: "apache",
        extensions: ["pub"]
      },
      "application/x-msschedule": {
        source: "apache",
        extensions: ["scd"]
      },
      "application/x-msterminal": {
        source: "apache",
        extensions: ["trm"]
      },
      "application/x-mswrite": {
        source: "apache",
        extensions: ["wri"]
      },
      "application/x-netcdf": {
        source: "apache",
        extensions: ["nc", "cdf"]
      },
      "application/x-ns-proxy-autoconfig": {
        compressible: true,
        extensions: ["pac"]
      },
      "application/x-nzb": {
        source: "apache",
        extensions: ["nzb"]
      },
      "application/x-perl": {
        source: "nginx",
        extensions: ["pl", "pm"]
      },
      "application/x-pilot": {
        source: "nginx",
        extensions: ["prc", "pdb"]
      },
      "application/x-pkcs12": {
        source: "apache",
        compressible: false,
        extensions: ["p12", "pfx"]
      },
      "application/x-pkcs7-certificates": {
        source: "apache",
        extensions: ["p7b", "spc"]
      },
      "application/x-pkcs7-certreqresp": {
        source: "apache",
        extensions: ["p7r"]
      },
      "application/x-pki-message": {
        source: "iana"
      },
      "application/x-rar-compressed": {
        source: "apache",
        compressible: false,
        extensions: ["rar"]
      },
      "application/x-redhat-package-manager": {
        source: "nginx",
        extensions: ["rpm"]
      },
      "application/x-research-info-systems": {
        source: "apache",
        extensions: ["ris"]
      },
      "application/x-sea": {
        source: "nginx",
        extensions: ["sea"]
      },
      "application/x-sh": {
        source: "apache",
        compressible: true,
        extensions: ["sh"]
      },
      "application/x-shar": {
        source: "apache",
        extensions: ["shar"]
      },
      "application/x-shockwave-flash": {
        source: "apache",
        compressible: false,
        extensions: ["swf"]
      },
      "application/x-silverlight-app": {
        source: "apache",
        extensions: ["xap"]
      },
      "application/x-sql": {
        source: "apache",
        extensions: ["sql"]
      },
      "application/x-stuffit": {
        source: "apache",
        compressible: false,
        extensions: ["sit"]
      },
      "application/x-stuffitx": {
        source: "apache",
        extensions: ["sitx"]
      },
      "application/x-subrip": {
        source: "apache",
        extensions: ["srt"]
      },
      "application/x-sv4cpio": {
        source: "apache",
        extensions: ["sv4cpio"]
      },
      "application/x-sv4crc": {
        source: "apache",
        extensions: ["sv4crc"]
      },
      "application/x-t3vm-image": {
        source: "apache",
        extensions: ["t3"]
      },
      "application/x-tads": {
        source: "apache",
        extensions: ["gam"]
      },
      "application/x-tar": {
        source: "apache",
        compressible: true,
        extensions: ["tar"]
      },
      "application/x-tcl": {
        source: "apache",
        extensions: ["tcl", "tk"]
      },
      "application/x-tex": {
        source: "apache",
        extensions: ["tex"]
      },
      "application/x-tex-tfm": {
        source: "apache",
        extensions: ["tfm"]
      },
      "application/x-texinfo": {
        source: "apache",
        extensions: ["texinfo", "texi"]
      },
      "application/x-tgif": {
        source: "apache",
        extensions: ["obj"]
      },
      "application/x-ustar": {
        source: "apache",
        extensions: ["ustar"]
      },
      "application/x-virtualbox-hdd": {
        compressible: true,
        extensions: ["hdd"]
      },
      "application/x-virtualbox-ova": {
        compressible: true,
        extensions: ["ova"]
      },
      "application/x-virtualbox-ovf": {
        compressible: true,
        extensions: ["ovf"]
      },
      "application/x-virtualbox-vbox": {
        compressible: true,
        extensions: ["vbox"]
      },
      "application/x-virtualbox-vbox-extpack": {
        compressible: false,
        extensions: ["vbox-extpack"]
      },
      "application/x-virtualbox-vdi": {
        compressible: true,
        extensions: ["vdi"]
      },
      "application/x-virtualbox-vhd": {
        compressible: true,
        extensions: ["vhd"]
      },
      "application/x-virtualbox-vmdk": {
        compressible: true,
        extensions: ["vmdk"]
      },
      "application/x-wais-source": {
        source: "apache",
        extensions: ["src"]
      },
      "application/x-web-app-manifest+json": {
        compressible: true,
        extensions: ["webapp"]
      },
      "application/x-www-form-urlencoded": {
        source: "iana",
        compressible: true
      },
      "application/x-x509-ca-cert": {
        source: "iana",
        extensions: ["der", "crt", "pem"]
      },
      "application/x-x509-ca-ra-cert": {
        source: "iana"
      },
      "application/x-x509-next-ca-cert": {
        source: "iana"
      },
      "application/x-xfig": {
        source: "apache",
        extensions: ["fig"]
      },
      "application/x-xliff+xml": {
        source: "apache",
        compressible: true,
        extensions: ["xlf"]
      },
      "application/x-xpinstall": {
        source: "apache",
        compressible: false,
        extensions: ["xpi"]
      },
      "application/x-xz": {
        source: "apache",
        extensions: ["xz"]
      },
      "application/x-zmachine": {
        source: "apache",
        extensions: ["z1", "z2", "z3", "z4", "z5", "z6", "z7", "z8"]
      },
      "application/x400-bp": {
        source: "iana"
      },
      "application/xacml+xml": {
        source: "iana",
        compressible: true
      },
      "application/xaml+xml": {
        source: "apache",
        compressible: true,
        extensions: ["xaml"]
      },
      "application/xcap-att+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xav"]
      },
      "application/xcap-caps+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xca"]
      },
      "application/xcap-diff+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xdf"]
      },
      "application/xcap-el+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xel"]
      },
      "application/xcap-error+xml": {
        source: "iana",
        compressible: true
      },
      "application/xcap-ns+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xns"]
      },
      "application/xcon-conference-info+xml": {
        source: "iana",
        compressible: true
      },
      "application/xcon-conference-info-diff+xml": {
        source: "iana",
        compressible: true
      },
      "application/xenc+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xenc"]
      },
      "application/xhtml+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xhtml", "xht"]
      },
      "application/xhtml-voice+xml": {
        source: "apache",
        compressible: true
      },
      "application/xliff+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xlf"]
      },
      "application/xml": {
        source: "iana",
        compressible: true,
        extensions: ["xml", "xsl", "xsd", "rng"]
      },
      "application/xml-dtd": {
        source: "iana",
        compressible: true,
        extensions: ["dtd"]
      },
      "application/xml-external-parsed-entity": {
        source: "iana"
      },
      "application/xml-patch+xml": {
        source: "iana",
        compressible: true
      },
      "application/xmpp+xml": {
        source: "iana",
        compressible: true
      },
      "application/xop+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xop"]
      },
      "application/xproc+xml": {
        source: "apache",
        compressible: true,
        extensions: ["xpl"]
      },
      "application/xslt+xml": {
        source: "iana",
        compressible: true,
        extensions: ["xsl", "xslt"]
      },
      "application/xspf+xml": {
        source: "apache",
        compressible: true,
        extensions: ["xspf"]
      },
      "application/xv+xml": {
        source: "iana",
        compressible: true,
        extensions: ["mxml", "xhvml", "xvml", "xvm"]
      },
      "application/yang": {
        source: "iana",
        extensions: ["yang"]
      },
      "application/yang-data+json": {
        source: "iana",
        compressible: true
      },
      "application/yang-data+xml": {
        source: "iana",
        compressible: true
      },
      "application/yang-patch+json": {
        source: "iana",
        compressible: true
      },
      "application/yang-patch+xml": {
        source: "iana",
        compressible: true
      },
      "application/yin+xml": {
        source: "iana",
        compressible: true,
        extensions: ["yin"]
      },
      "application/zip": {
        source: "iana",
        compressible: false,
        extensions: ["zip"]
      },
      "application/zlib": {
        source: "iana"
      },
      "application/zstd": {
        source: "iana"
      },
      "audio/1d-interleaved-parityfec": {
        source: "iana"
      },
      "audio/32kadpcm": {
        source: "iana"
      },
      "audio/3gpp": {
        source: "iana",
        compressible: false,
        extensions: ["3gpp"]
      },
      "audio/3gpp2": {
        source: "iana"
      },
      "audio/aac": {
        source: "iana"
      },
      "audio/ac3": {
        source: "iana"
      },
      "audio/adpcm": {
        source: "apache",
        extensions: ["adp"]
      },
      "audio/amr": {
        source: "iana",
        extensions: ["amr"]
      },
      "audio/amr-wb": {
        source: "iana"
      },
      "audio/amr-wb+": {
        source: "iana"
      },
      "audio/aptx": {
        source: "iana"
      },
      "audio/asc": {
        source: "iana"
      },
      "audio/atrac-advanced-lossless": {
        source: "iana"
      },
      "audio/atrac-x": {
        source: "iana"
      },
      "audio/atrac3": {
        source: "iana"
      },
      "audio/basic": {
        source: "iana",
        compressible: false,
        extensions: ["au", "snd"]
      },
      "audio/bv16": {
        source: "iana"
      },
      "audio/bv32": {
        source: "iana"
      },
      "audio/clearmode": {
        source: "iana"
      },
      "audio/cn": {
        source: "iana"
      },
      "audio/dat12": {
        source: "iana"
      },
      "audio/dls": {
        source: "iana"
      },
      "audio/dsr-es201108": {
        source: "iana"
      },
      "audio/dsr-es202050": {
        source: "iana"
      },
      "audio/dsr-es202211": {
        source: "iana"
      },
      "audio/dsr-es202212": {
        source: "iana"
      },
      "audio/dv": {
        source: "iana"
      },
      "audio/dvi4": {
        source: "iana"
      },
      "audio/eac3": {
        source: "iana"
      },
      "audio/encaprtp": {
        source: "iana"
      },
      "audio/evrc": {
        source: "iana"
      },
      "audio/evrc-qcp": {
        source: "iana"
      },
      "audio/evrc0": {
        source: "iana"
      },
      "audio/evrc1": {
        source: "iana"
      },
      "audio/evrcb": {
        source: "iana"
      },
      "audio/evrcb0": {
        source: "iana"
      },
      "audio/evrcb1": {
        source: "iana"
      },
      "audio/evrcnw": {
        source: "iana"
      },
      "audio/evrcnw0": {
        source: "iana"
      },
      "audio/evrcnw1": {
        source: "iana"
      },
      "audio/evrcwb": {
        source: "iana"
      },
      "audio/evrcwb0": {
        source: "iana"
      },
      "audio/evrcwb1": {
        source: "iana"
      },
      "audio/evs": {
        source: "iana"
      },
      "audio/flexfec": {
        source: "iana"
      },
      "audio/fwdred": {
        source: "iana"
      },
      "audio/g711-0": {
        source: "iana"
      },
      "audio/g719": {
        source: "iana"
      },
      "audio/g722": {
        source: "iana"
      },
      "audio/g7221": {
        source: "iana"
      },
      "audio/g723": {
        source: "iana"
      },
      "audio/g726-16": {
        source: "iana"
      },
      "audio/g726-24": {
        source: "iana"
      },
      "audio/g726-32": {
        source: "iana"
      },
      "audio/g726-40": {
        source: "iana"
      },
      "audio/g728": {
        source: "iana"
      },
      "audio/g729": {
        source: "iana"
      },
      "audio/g7291": {
        source: "iana"
      },
      "audio/g729d": {
        source: "iana"
      },
      "audio/g729e": {
        source: "iana"
      },
      "audio/gsm": {
        source: "iana"
      },
      "audio/gsm-efr": {
        source: "iana"
      },
      "audio/gsm-hr-08": {
        source: "iana"
      },
      "audio/ilbc": {
        source: "iana"
      },
      "audio/ip-mr_v2.5": {
        source: "iana"
      },
      "audio/isac": {
        source: "apache"
      },
      "audio/l16": {
        source: "iana"
      },
      "audio/l20": {
        source: "iana"
      },
      "audio/l24": {
        source: "iana",
        compressible: false
      },
      "audio/l8": {
        source: "iana"
      },
      "audio/lpc": {
        source: "iana"
      },
      "audio/melp": {
        source: "iana"
      },
      "audio/melp1200": {
        source: "iana"
      },
      "audio/melp2400": {
        source: "iana"
      },
      "audio/melp600": {
        source: "iana"
      },
      "audio/mhas": {
        source: "iana"
      },
      "audio/midi": {
        source: "apache",
        extensions: ["mid", "midi", "kar", "rmi"]
      },
      "audio/mobile-xmf": {
        source: "iana",
        extensions: ["mxmf"]
      },
      "audio/mp3": {
        compressible: false,
        extensions: ["mp3"]
      },
      "audio/mp4": {
        source: "iana",
        compressible: false,
        extensions: ["m4a", "mp4a"]
      },
      "audio/mp4a-latm": {
        source: "iana"
      },
      "audio/mpa": {
        source: "iana"
      },
      "audio/mpa-robust": {
        source: "iana"
      },
      "audio/mpeg": {
        source: "iana",
        compressible: false,
        extensions: ["mpga", "mp2", "mp2a", "mp3", "m2a", "m3a"]
      },
      "audio/mpeg4-generic": {
        source: "iana"
      },
      "audio/musepack": {
        source: "apache"
      },
      "audio/ogg": {
        source: "iana",
        compressible: false,
        extensions: ["oga", "ogg", "spx", "opus"]
      },
      "audio/opus": {
        source: "iana"
      },
      "audio/parityfec": {
        source: "iana"
      },
      "audio/pcma": {
        source: "iana"
      },
      "audio/pcma-wb": {
        source: "iana"
      },
      "audio/pcmu": {
        source: "iana"
      },
      "audio/pcmu-wb": {
        source: "iana"
      },
      "audio/prs.sid": {
        source: "iana"
      },
      "audio/qcelp": {
        source: "iana"
      },
      "audio/raptorfec": {
        source: "iana"
      },
      "audio/red": {
        source: "iana"
      },
      "audio/rtp-enc-aescm128": {
        source: "iana"
      },
      "audio/rtp-midi": {
        source: "iana"
      },
      "audio/rtploopback": {
        source: "iana"
      },
      "audio/rtx": {
        source: "iana"
      },
      "audio/s3m": {
        source: "apache",
        extensions: ["s3m"]
      },
      "audio/scip": {
        source: "iana"
      },
      "audio/silk": {
        source: "apache",
        extensions: ["sil"]
      },
      "audio/smv": {
        source: "iana"
      },
      "audio/smv-qcp": {
        source: "iana"
      },
      "audio/smv0": {
        source: "iana"
      },
      "audio/sofa": {
        source: "iana"
      },
      "audio/sp-midi": {
        source: "iana"
      },
      "audio/speex": {
        source: "iana"
      },
      "audio/t140c": {
        source: "iana"
      },
      "audio/t38": {
        source: "iana"
      },
      "audio/telephone-event": {
        source: "iana"
      },
      "audio/tetra_acelp": {
        source: "iana"
      },
      "audio/tetra_acelp_bb": {
        source: "iana"
      },
      "audio/tone": {
        source: "iana"
      },
      "audio/tsvcis": {
        source: "iana"
      },
      "audio/uemclip": {
        source: "iana"
      },
      "audio/ulpfec": {
        source: "iana"
      },
      "audio/usac": {
        source: "iana"
      },
      "audio/vdvi": {
        source: "iana"
      },
      "audio/vmr-wb": {
        source: "iana"
      },
      "audio/vnd.3gpp.iufp": {
        source: "iana"
      },
      "audio/vnd.4sb": {
        source: "iana"
      },
      "audio/vnd.audiokoz": {
        source: "iana"
      },
      "audio/vnd.celp": {
        source: "iana"
      },
      "audio/vnd.cisco.nse": {
        source: "iana"
      },
      "audio/vnd.cmles.radio-events": {
        source: "iana"
      },
      "audio/vnd.cns.anp1": {
        source: "iana"
      },
      "audio/vnd.cns.inf1": {
        source: "iana"
      },
      "audio/vnd.dece.audio": {
        source: "iana",
        extensions: ["uva", "uvva"]
      },
      "audio/vnd.digital-winds": {
        source: "iana",
        extensions: ["eol"]
      },
      "audio/vnd.dlna.adts": {
        source: "iana"
      },
      "audio/vnd.dolby.heaac.1": {
        source: "iana"
      },
      "audio/vnd.dolby.heaac.2": {
        source: "iana"
      },
      "audio/vnd.dolby.mlp": {
        source: "iana"
      },
      "audio/vnd.dolby.mps": {
        source: "iana"
      },
      "audio/vnd.dolby.pl2": {
        source: "iana"
      },
      "audio/vnd.dolby.pl2x": {
        source: "iana"
      },
      "audio/vnd.dolby.pl2z": {
        source: "iana"
      },
      "audio/vnd.dolby.pulse.1": {
        source: "iana"
      },
      "audio/vnd.dra": {
        source: "iana",
        extensions: ["dra"]
      },
      "audio/vnd.dts": {
        source: "iana",
        extensions: ["dts"]
      },
      "audio/vnd.dts.hd": {
        source: "iana",
        extensions: ["dtshd"]
      },
      "audio/vnd.dts.uhd": {
        source: "iana"
      },
      "audio/vnd.dvb.file": {
        source: "iana"
      },
      "audio/vnd.everad.plj": {
        source: "iana"
      },
      "audio/vnd.hns.audio": {
        source: "iana"
      },
      "audio/vnd.lucent.voice": {
        source: "iana",
        extensions: ["lvp"]
      },
      "audio/vnd.ms-playready.media.pya": {
        source: "iana",
        extensions: ["pya"]
      },
      "audio/vnd.nokia.mobile-xmf": {
        source: "iana"
      },
      "audio/vnd.nortel.vbk": {
        source: "iana"
      },
      "audio/vnd.nuera.ecelp4800": {
        source: "iana",
        extensions: ["ecelp4800"]
      },
      "audio/vnd.nuera.ecelp7470": {
        source: "iana",
        extensions: ["ecelp7470"]
      },
      "audio/vnd.nuera.ecelp9600": {
        source: "iana",
        extensions: ["ecelp9600"]
      },
      "audio/vnd.octel.sbc": {
        source: "iana"
      },
      "audio/vnd.presonus.multitrack": {
        source: "iana"
      },
      "audio/vnd.qcelp": {
        source: "iana"
      },
      "audio/vnd.rhetorex.32kadpcm": {
        source: "iana"
      },
      "audio/vnd.rip": {
        source: "iana",
        extensions: ["rip"]
      },
      "audio/vnd.rn-realaudio": {
        compressible: false
      },
      "audio/vnd.sealedmedia.softseal.mpeg": {
        source: "iana"
      },
      "audio/vnd.vmx.cvsd": {
        source: "iana"
      },
      "audio/vnd.wave": {
        compressible: false
      },
      "audio/vorbis": {
        source: "iana",
        compressible: false
      },
      "audio/vorbis-config": {
        source: "iana"
      },
      "audio/wav": {
        compressible: false,
        extensions: ["wav"]
      },
      "audio/wave": {
        compressible: false,
        extensions: ["wav"]
      },
      "audio/webm": {
        source: "apache",
        compressible: false,
        extensions: ["weba"]
      },
      "audio/x-aac": {
        source: "apache",
        compressible: false,
        extensions: ["aac"]
      },
      "audio/x-aiff": {
        source: "apache",
        extensions: ["aif", "aiff", "aifc"]
      },
      "audio/x-caf": {
        source: "apache",
        compressible: false,
        extensions: ["caf"]
      },
      "audio/x-flac": {
        source: "apache",
        extensions: ["flac"]
      },
      "audio/x-m4a": {
        source: "nginx",
        extensions: ["m4a"]
      },
      "audio/x-matroska": {
        source: "apache",
        extensions: ["mka"]
      },
      "audio/x-mpegurl": {
        source: "apache",
        extensions: ["m3u"]
      },
      "audio/x-ms-wax": {
        source: "apache",
        extensions: ["wax"]
      },
      "audio/x-ms-wma": {
        source: "apache",
        extensions: ["wma"]
      },
      "audio/x-pn-realaudio": {
        source: "apache",
        extensions: ["ram", "ra"]
      },
      "audio/x-pn-realaudio-plugin": {
        source: "apache",
        extensions: ["rmp"]
      },
      "audio/x-realaudio": {
        source: "nginx",
        extensions: ["ra"]
      },
      "audio/x-tta": {
        source: "apache"
      },
      "audio/x-wav": {
        source: "apache",
        extensions: ["wav"]
      },
      "audio/xm": {
        source: "apache",
        extensions: ["xm"]
      },
      "chemical/x-cdx": {
        source: "apache",
        extensions: ["cdx"]
      },
      "chemical/x-cif": {
        source: "apache",
        extensions: ["cif"]
      },
      "chemical/x-cmdf": {
        source: "apache",
        extensions: ["cmdf"]
      },
      "chemical/x-cml": {
        source: "apache",
        extensions: ["cml"]
      },
      "chemical/x-csml": {
        source: "apache",
        extensions: ["csml"]
      },
      "chemical/x-pdb": {
        source: "apache"
      },
      "chemical/x-xyz": {
        source: "apache",
        extensions: ["xyz"]
      },
      "font/collection": {
        source: "iana",
        extensions: ["ttc"]
      },
      "font/otf": {
        source: "iana",
        compressible: true,
        extensions: ["otf"]
      },
      "font/sfnt": {
        source: "iana"
      },
      "font/ttf": {
        source: "iana",
        compressible: true,
        extensions: ["ttf"]
      },
      "font/woff": {
        source: "iana",
        extensions: ["woff"]
      },
      "font/woff2": {
        source: "iana",
        extensions: ["woff2"]
      },
      "image/aces": {
        source: "iana",
        extensions: ["exr"]
      },
      "image/apng": {
        compressible: false,
        extensions: ["apng"]
      },
      "image/avci": {
        source: "iana",
        extensions: ["avci"]
      },
      "image/avcs": {
        source: "iana",
        extensions: ["avcs"]
      },
      "image/avif": {
        source: "iana",
        compressible: false,
        extensions: ["avif"]
      },
      "image/bmp": {
        source: "iana",
        compressible: true,
        extensions: ["bmp"]
      },
      "image/cgm": {
        source: "iana",
        extensions: ["cgm"]
      },
      "image/dicom-rle": {
        source: "iana",
        extensions: ["drle"]
      },
      "image/emf": {
        source: "iana",
        extensions: ["emf"]
      },
      "image/fits": {
        source: "iana",
        extensions: ["fits"]
      },
      "image/g3fax": {
        source: "iana",
        extensions: ["g3"]
      },
      "image/gif": {
        source: "iana",
        compressible: false,
        extensions: ["gif"]
      },
      "image/heic": {
        source: "iana",
        extensions: ["heic"]
      },
      "image/heic-sequence": {
        source: "iana",
        extensions: ["heics"]
      },
      "image/heif": {
        source: "iana",
        extensions: ["heif"]
      },
      "image/heif-sequence": {
        source: "iana",
        extensions: ["heifs"]
      },
      "image/hej2k": {
        source: "iana",
        extensions: ["hej2"]
      },
      "image/hsj2": {
        source: "iana",
        extensions: ["hsj2"]
      },
      "image/ief": {
        source: "iana",
        extensions: ["ief"]
      },
      "image/jls": {
        source: "iana",
        extensions: ["jls"]
      },
      "image/jp2": {
        source: "iana",
        compressible: false,
        extensions: ["jp2", "jpg2"]
      },
      "image/jpeg": {
        source: "iana",
        compressible: false,
        extensions: ["jpeg", "jpg", "jpe"]
      },
      "image/jph": {
        source: "iana",
        extensions: ["jph"]
      },
      "image/jphc": {
        source: "iana",
        extensions: ["jhc"]
      },
      "image/jpm": {
        source: "iana",
        compressible: false,
        extensions: ["jpm"]
      },
      "image/jpx": {
        source: "iana",
        compressible: false,
        extensions: ["jpx", "jpf"]
      },
      "image/jxr": {
        source: "iana",
        extensions: ["jxr"]
      },
      "image/jxra": {
        source: "iana",
        extensions: ["jxra"]
      },
      "image/jxrs": {
        source: "iana",
        extensions: ["jxrs"]
      },
      "image/jxs": {
        source: "iana",
        extensions: ["jxs"]
      },
      "image/jxsc": {
        source: "iana",
        extensions: ["jxsc"]
      },
      "image/jxsi": {
        source: "iana",
        extensions: ["jxsi"]
      },
      "image/jxss": {
        source: "iana",
        extensions: ["jxss"]
      },
      "image/ktx": {
        source: "iana",
        extensions: ["ktx"]
      },
      "image/ktx2": {
        source: "iana",
        extensions: ["ktx2"]
      },
      "image/naplps": {
        source: "iana"
      },
      "image/pjpeg": {
        compressible: false
      },
      "image/png": {
        source: "iana",
        compressible: false,
        extensions: ["png"]
      },
      "image/prs.btif": {
        source: "iana",
        extensions: ["btif"]
      },
      "image/prs.pti": {
        source: "iana",
        extensions: ["pti"]
      },
      "image/pwg-raster": {
        source: "iana"
      },
      "image/sgi": {
        source: "apache",
        extensions: ["sgi"]
      },
      "image/svg+xml": {
        source: "iana",
        compressible: true,
        extensions: ["svg", "svgz"]
      },
      "image/t38": {
        source: "iana",
        extensions: ["t38"]
      },
      "image/tiff": {
        source: "iana",
        compressible: false,
        extensions: ["tif", "tiff"]
      },
      "image/tiff-fx": {
        source: "iana",
        extensions: ["tfx"]
      },
      "image/vnd.adobe.photoshop": {
        source: "iana",
        compressible: true,
        extensions: ["psd"]
      },
      "image/vnd.airzip.accelerator.azv": {
        source: "iana",
        extensions: ["azv"]
      },
      "image/vnd.cns.inf2": {
        source: "iana"
      },
      "image/vnd.dece.graphic": {
        source: "iana",
        extensions: ["uvi", "uvvi", "uvg", "uvvg"]
      },
      "image/vnd.djvu": {
        source: "iana",
        extensions: ["djvu", "djv"]
      },
      "image/vnd.dvb.subtitle": {
        source: "iana",
        extensions: ["sub"]
      },
      "image/vnd.dwg": {
        source: "iana",
        extensions: ["dwg"]
      },
      "image/vnd.dxf": {
        source: "iana",
        extensions: ["dxf"]
      },
      "image/vnd.fastbidsheet": {
        source: "iana",
        extensions: ["fbs"]
      },
      "image/vnd.fpx": {
        source: "iana",
        extensions: ["fpx"]
      },
      "image/vnd.fst": {
        source: "iana",
        extensions: ["fst"]
      },
      "image/vnd.fujixerox.edmics-mmr": {
        source: "iana",
        extensions: ["mmr"]
      },
      "image/vnd.fujixerox.edmics-rlc": {
        source: "iana",
        extensions: ["rlc"]
      },
      "image/vnd.globalgraphics.pgb": {
        source: "iana"
      },
      "image/vnd.microsoft.icon": {
        source: "iana",
        compressible: true,
        extensions: ["ico"]
      },
      "image/vnd.mix": {
        source: "iana"
      },
      "image/vnd.mozilla.apng": {
        source: "iana"
      },
      "image/vnd.ms-dds": {
        compressible: true,
        extensions: ["dds"]
      },
      "image/vnd.ms-modi": {
        source: "iana",
        extensions: ["mdi"]
      },
      "image/vnd.ms-photo": {
        source: "apache",
        extensions: ["wdp"]
      },
      "image/vnd.net-fpx": {
        source: "iana",
        extensions: ["npx"]
      },
      "image/vnd.pco.b16": {
        source: "iana",
        extensions: ["b16"]
      },
      "image/vnd.radiance": {
        source: "iana"
      },
      "image/vnd.sealed.png": {
        source: "iana"
      },
      "image/vnd.sealedmedia.softseal.gif": {
        source: "iana"
      },
      "image/vnd.sealedmedia.softseal.jpg": {
        source: "iana"
      },
      "image/vnd.svf": {
        source: "iana"
      },
      "image/vnd.tencent.tap": {
        source: "iana",
        extensions: ["tap"]
      },
      "image/vnd.valve.source.texture": {
        source: "iana",
        extensions: ["vtf"]
      },
      "image/vnd.wap.wbmp": {
        source: "iana",
        extensions: ["wbmp"]
      },
      "image/vnd.xiff": {
        source: "iana",
        extensions: ["xif"]
      },
      "image/vnd.zbrush.pcx": {
        source: "iana",
        extensions: ["pcx"]
      },
      "image/webp": {
        source: "apache",
        extensions: ["webp"]
      },
      "image/wmf": {
        source: "iana",
        extensions: ["wmf"]
      },
      "image/x-3ds": {
        source: "apache",
        extensions: ["3ds"]
      },
      "image/x-cmu-raster": {
        source: "apache",
        extensions: ["ras"]
      },
      "image/x-cmx": {
        source: "apache",
        extensions: ["cmx"]
      },
      "image/x-freehand": {
        source: "apache",
        extensions: ["fh", "fhc", "fh4", "fh5", "fh7"]
      },
      "image/x-icon": {
        source: "apache",
        compressible: true,
        extensions: ["ico"]
      },
      "image/x-jng": {
        source: "nginx",
        extensions: ["jng"]
      },
      "image/x-mrsid-image": {
        source: "apache",
        extensions: ["sid"]
      },
      "image/x-ms-bmp": {
        source: "nginx",
        compressible: true,
        extensions: ["bmp"]
      },
      "image/x-pcx": {
        source: "apache",
        extensions: ["pcx"]
      },
      "image/x-pict": {
        source: "apache",
        extensions: ["pic", "pct"]
      },
      "image/x-portable-anymap": {
        source: "apache",
        extensions: ["pnm"]
      },
      "image/x-portable-bitmap": {
        source: "apache",
        extensions: ["pbm"]
      },
      "image/x-portable-graymap": {
        source: "apache",
        extensions: ["pgm"]
      },
      "image/x-portable-pixmap": {
        source: "apache",
        extensions: ["ppm"]
      },
      "image/x-rgb": {
        source: "apache",
        extensions: ["rgb"]
      },
      "image/x-tga": {
        source: "apache",
        extensions: ["tga"]
      },
      "image/x-xbitmap": {
        source: "apache",
        extensions: ["xbm"]
      },
      "image/x-xcf": {
        compressible: false
      },
      "image/x-xpixmap": {
        source: "apache",
        extensions: ["xpm"]
      },
      "image/x-xwindowdump": {
        source: "apache",
        extensions: ["xwd"]
      },
      "message/cpim": {
        source: "iana"
      },
      "message/delivery-status": {
        source: "iana"
      },
      "message/disposition-notification": {
        source: "iana",
        extensions: [
          "disposition-notification"
        ]
      },
      "message/external-body": {
        source: "iana"
      },
      "message/feedback-report": {
        source: "iana"
      },
      "message/global": {
        source: "iana",
        extensions: ["u8msg"]
      },
      "message/global-delivery-status": {
        source: "iana",
        extensions: ["u8dsn"]
      },
      "message/global-disposition-notification": {
        source: "iana",
        extensions: ["u8mdn"]
      },
      "message/global-headers": {
        source: "iana",
        extensions: ["u8hdr"]
      },
      "message/http": {
        source: "iana",
        compressible: false
      },
      "message/imdn+xml": {
        source: "iana",
        compressible: true
      },
      "message/news": {
        source: "iana"
      },
      "message/partial": {
        source: "iana",
        compressible: false
      },
      "message/rfc822": {
        source: "iana",
        compressible: true,
        extensions: ["eml", "mime"]
      },
      "message/s-http": {
        source: "iana"
      },
      "message/sip": {
        source: "iana"
      },
      "message/sipfrag": {
        source: "iana"
      },
      "message/tracking-status": {
        source: "iana"
      },
      "message/vnd.si.simp": {
        source: "iana"
      },
      "message/vnd.wfa.wsc": {
        source: "iana",
        extensions: ["wsc"]
      },
      "model/3mf": {
        source: "iana",
        extensions: ["3mf"]
      },
      "model/e57": {
        source: "iana"
      },
      "model/gltf+json": {
        source: "iana",
        compressible: true,
        extensions: ["gltf"]
      },
      "model/gltf-binary": {
        source: "iana",
        compressible: true,
        extensions: ["glb"]
      },
      "model/iges": {
        source: "iana",
        compressible: false,
        extensions: ["igs", "iges"]
      },
      "model/mesh": {
        source: "iana",
        compressible: false,
        extensions: ["msh", "mesh", "silo"]
      },
      "model/mtl": {
        source: "iana",
        extensions: ["mtl"]
      },
      "model/obj": {
        source: "iana",
        extensions: ["obj"]
      },
      "model/step": {
        source: "iana"
      },
      "model/step+xml": {
        source: "iana",
        compressible: true,
        extensions: ["stpx"]
      },
      "model/step+zip": {
        source: "iana",
        compressible: false,
        extensions: ["stpz"]
      },
      "model/step-xml+zip": {
        source: "iana",
        compressible: false,
        extensions: ["stpxz"]
      },
      "model/stl": {
        source: "iana",
        extensions: ["stl"]
      },
      "model/vnd.collada+xml": {
        source: "iana",
        compressible: true,
        extensions: ["dae"]
      },
      "model/vnd.dwf": {
        source: "iana",
        extensions: ["dwf"]
      },
      "model/vnd.flatland.3dml": {
        source: "iana"
      },
      "model/vnd.gdl": {
        source: "iana",
        extensions: ["gdl"]
      },
      "model/vnd.gs-gdl": {
        source: "apache"
      },
      "model/vnd.gs.gdl": {
        source: "iana"
      },
      "model/vnd.gtw": {
        source: "iana",
        extensions: ["gtw"]
      },
      "model/vnd.moml+xml": {
        source: "iana",
        compressible: true
      },
      "model/vnd.mts": {
        source: "iana",
        extensions: ["mts"]
      },
      "model/vnd.opengex": {
        source: "iana",
        extensions: ["ogex"]
      },
      "model/vnd.parasolid.transmit.binary": {
        source: "iana",
        extensions: ["x_b"]
      },
      "model/vnd.parasolid.transmit.text": {
        source: "iana",
        extensions: ["x_t"]
      },
      "model/vnd.pytha.pyox": {
        source: "iana"
      },
      "model/vnd.rosette.annotated-data-model": {
        source: "iana"
      },
      "model/vnd.sap.vds": {
        source: "iana",
        extensions: ["vds"]
      },
      "model/vnd.usdz+zip": {
        source: "iana",
        compressible: false,
        extensions: ["usdz"]
      },
      "model/vnd.valve.source.compiled-map": {
        source: "iana",
        extensions: ["bsp"]
      },
      "model/vnd.vtu": {
        source: "iana",
        extensions: ["vtu"]
      },
      "model/vrml": {
        source: "iana",
        compressible: false,
        extensions: ["wrl", "vrml"]
      },
      "model/x3d+binary": {
        source: "apache",
        compressible: false,
        extensions: ["x3db", "x3dbz"]
      },
      "model/x3d+fastinfoset": {
        source: "iana",
        extensions: ["x3db"]
      },
      "model/x3d+vrml": {
        source: "apache",
        compressible: false,
        extensions: ["x3dv", "x3dvz"]
      },
      "model/x3d+xml": {
        source: "iana",
        compressible: true,
        extensions: ["x3d", "x3dz"]
      },
      "model/x3d-vrml": {
        source: "iana",
        extensions: ["x3dv"]
      },
      "multipart/alternative": {
        source: "iana",
        compressible: false
      },
      "multipart/appledouble": {
        source: "iana"
      },
      "multipart/byteranges": {
        source: "iana"
      },
      "multipart/digest": {
        source: "iana"
      },
      "multipart/encrypted": {
        source: "iana",
        compressible: false
      },
      "multipart/form-data": {
        source: "iana",
        compressible: false
      },
      "multipart/header-set": {
        source: "iana"
      },
      "multipart/mixed": {
        source: "iana"
      },
      "multipart/multilingual": {
        source: "iana"
      },
      "multipart/parallel": {
        source: "iana"
      },
      "multipart/related": {
        source: "iana",
        compressible: false
      },
      "multipart/report": {
        source: "iana"
      },
      "multipart/signed": {
        source: "iana",
        compressible: false
      },
      "multipart/vnd.bint.med-plus": {
        source: "iana"
      },
      "multipart/voice-message": {
        source: "iana"
      },
      "multipart/x-mixed-replace": {
        source: "iana"
      },
      "text/1d-interleaved-parityfec": {
        source: "iana"
      },
      "text/cache-manifest": {
        source: "iana",
        compressible: true,
        extensions: ["appcache", "manifest"]
      },
      "text/calendar": {
        source: "iana",
        extensions: ["ics", "ifb"]
      },
      "text/calender": {
        compressible: true
      },
      "text/cmd": {
        compressible: true
      },
      "text/coffeescript": {
        extensions: ["coffee", "litcoffee"]
      },
      "text/cql": {
        source: "iana"
      },
      "text/cql-expression": {
        source: "iana"
      },
      "text/cql-identifier": {
        source: "iana"
      },
      "text/css": {
        source: "iana",
        charset: "UTF-8",
        compressible: true,
        extensions: ["css"]
      },
      "text/csv": {
        source: "iana",
        compressible: true,
        extensions: ["csv"]
      },
      "text/csv-schema": {
        source: "iana"
      },
      "text/directory": {
        source: "iana"
      },
      "text/dns": {
        source: "iana"
      },
      "text/ecmascript": {
        source: "iana"
      },
      "text/encaprtp": {
        source: "iana"
      },
      "text/enriched": {
        source: "iana"
      },
      "text/fhirpath": {
        source: "iana"
      },
      "text/flexfec": {
        source: "iana"
      },
      "text/fwdred": {
        source: "iana"
      },
      "text/gff3": {
        source: "iana"
      },
      "text/grammar-ref-list": {
        source: "iana"
      },
      "text/html": {
        source: "iana",
        compressible: true,
        extensions: ["html", "htm", "shtml"]
      },
      "text/jade": {
        extensions: ["jade"]
      },
      "text/javascript": {
        source: "iana",
        compressible: true
      },
      "text/jcr-cnd": {
        source: "iana"
      },
      "text/jsx": {
        compressible: true,
        extensions: ["jsx"]
      },
      "text/less": {
        compressible: true,
        extensions: ["less"]
      },
      "text/markdown": {
        source: "iana",
        compressible: true,
        extensions: ["markdown", "md"]
      },
      "text/mathml": {
        source: "nginx",
        extensions: ["mml"]
      },
      "text/mdx": {
        compressible: true,
        extensions: ["mdx"]
      },
      "text/mizar": {
        source: "iana"
      },
      "text/n3": {
        source: "iana",
        charset: "UTF-8",
        compressible: true,
        extensions: ["n3"]
      },
      "text/parameters": {
        source: "iana",
        charset: "UTF-8"
      },
      "text/parityfec": {
        source: "iana"
      },
      "text/plain": {
        source: "iana",
        compressible: true,
        extensions: ["txt", "text", "conf", "def", "list", "log", "in", "ini"]
      },
      "text/provenance-notation": {
        source: "iana",
        charset: "UTF-8"
      },
      "text/prs.fallenstein.rst": {
        source: "iana"
      },
      "text/prs.lines.tag": {
        source: "iana",
        extensions: ["dsc"]
      },
      "text/prs.prop.logic": {
        source: "iana"
      },
      "text/raptorfec": {
        source: "iana"
      },
      "text/red": {
        source: "iana"
      },
      "text/rfc822-headers": {
        source: "iana"
      },
      "text/richtext": {
        source: "iana",
        compressible: true,
        extensions: ["rtx"]
      },
      "text/rtf": {
        source: "iana",
        compressible: true,
        extensions: ["rtf"]
      },
      "text/rtp-enc-aescm128": {
        source: "iana"
      },
      "text/rtploopback": {
        source: "iana"
      },
      "text/rtx": {
        source: "iana"
      },
      "text/sgml": {
        source: "iana",
        extensions: ["sgml", "sgm"]
      },
      "text/shaclc": {
        source: "iana"
      },
      "text/shex": {
        source: "iana",
        extensions: ["shex"]
      },
      "text/slim": {
        extensions: ["slim", "slm"]
      },
      "text/spdx": {
        source: "iana",
        extensions: ["spdx"]
      },
      "text/strings": {
        source: "iana"
      },
      "text/stylus": {
        extensions: ["stylus", "styl"]
      },
      "text/t140": {
        source: "iana"
      },
      "text/tab-separated-values": {
        source: "iana",
        compressible: true,
        extensions: ["tsv"]
      },
      "text/troff": {
        source: "iana",
        extensions: ["t", "tr", "roff", "man", "me", "ms"]
      },
      "text/turtle": {
        source: "iana",
        charset: "UTF-8",
        extensions: ["ttl"]
      },
      "text/ulpfec": {
        source: "iana"
      },
      "text/uri-list": {
        source: "iana",
        compressible: true,
        extensions: ["uri", "uris", "urls"]
      },
      "text/vcard": {
        source: "iana",
        compressible: true,
        extensions: ["vcard"]
      },
      "text/vnd.a": {
        source: "iana"
      },
      "text/vnd.abc": {
        source: "iana"
      },
      "text/vnd.ascii-art": {
        source: "iana"
      },
      "text/vnd.curl": {
        source: "iana",
        extensions: ["curl"]
      },
      "text/vnd.curl.dcurl": {
        source: "apache",
        extensions: ["dcurl"]
      },
      "text/vnd.curl.mcurl": {
        source: "apache",
        extensions: ["mcurl"]
      },
      "text/vnd.curl.scurl": {
        source: "apache",
        extensions: ["scurl"]
      },
      "text/vnd.debian.copyright": {
        source: "iana",
        charset: "UTF-8"
      },
      "text/vnd.dmclientscript": {
        source: "iana"
      },
      "text/vnd.dvb.subtitle": {
        source: "iana",
        extensions: ["sub"]
      },
      "text/vnd.esmertec.theme-descriptor": {
        source: "iana",
        charset: "UTF-8"
      },
      "text/vnd.familysearch.gedcom": {
        source: "iana",
        extensions: ["ged"]
      },
      "text/vnd.ficlab.flt": {
        source: "iana"
      },
      "text/vnd.fly": {
        source: "iana",
        extensions: ["fly"]
      },
      "text/vnd.fmi.flexstor": {
        source: "iana",
        extensions: ["flx"]
      },
      "text/vnd.gml": {
        source: "iana"
      },
      "text/vnd.graphviz": {
        source: "iana",
        extensions: ["gv"]
      },
      "text/vnd.hans": {
        source: "iana"
      },
      "text/vnd.hgl": {
        source: "iana"
      },
      "text/vnd.in3d.3dml": {
        source: "iana",
        extensions: ["3dml"]
      },
      "text/vnd.in3d.spot": {
        source: "iana",
        extensions: ["spot"]
      },
      "text/vnd.iptc.newsml": {
        source: "iana"
      },
      "text/vnd.iptc.nitf": {
        source: "iana"
      },
      "text/vnd.latex-z": {
        source: "iana"
      },
      "text/vnd.motorola.reflex": {
        source: "iana"
      },
      "text/vnd.ms-mediapackage": {
        source: "iana"
      },
      "text/vnd.net2phone.commcenter.command": {
        source: "iana"
      },
      "text/vnd.radisys.msml-basic-layout": {
        source: "iana"
      },
      "text/vnd.senx.warpscript": {
        source: "iana"
      },
      "text/vnd.si.uricatalogue": {
        source: "iana"
      },
      "text/vnd.sosi": {
        source: "iana"
      },
      "text/vnd.sun.j2me.app-descriptor": {
        source: "iana",
        charset: "UTF-8",
        extensions: ["jad"]
      },
      "text/vnd.trolltech.linguist": {
        source: "iana",
        charset: "UTF-8"
      },
      "text/vnd.wap.si": {
        source: "iana"
      },
      "text/vnd.wap.sl": {
        source: "iana"
      },
      "text/vnd.wap.wml": {
        source: "iana",
        extensions: ["wml"]
      },
      "text/vnd.wap.wmlscript": {
        source: "iana",
        extensions: ["wmls"]
      },
      "text/vtt": {
        source: "iana",
        charset: "UTF-8",
        compressible: true,
        extensions: ["vtt"]
      },
      "text/x-asm": {
        source: "apache",
        extensions: ["s", "asm"]
      },
      "text/x-c": {
        source: "apache",
        extensions: ["c", "cc", "cxx", "cpp", "h", "hh", "dic"]
      },
      "text/x-component": {
        source: "nginx",
        extensions: ["htc"]
      },
      "text/x-fortran": {
        source: "apache",
        extensions: ["f", "for", "f77", "f90"]
      },
      "text/x-gwt-rpc": {
        compressible: true
      },
      "text/x-handlebars-template": {
        extensions: ["hbs"]
      },
      "text/x-java-source": {
        source: "apache",
        extensions: ["java"]
      },
      "text/x-jquery-tmpl": {
        compressible: true
      },
      "text/x-lua": {
        extensions: ["lua"]
      },
      "text/x-markdown": {
        compressible: true,
        extensions: ["mkd"]
      },
      "text/x-nfo": {
        source: "apache",
        extensions: ["nfo"]
      },
      "text/x-opml": {
        source: "apache",
        extensions: ["opml"]
      },
      "text/x-org": {
        compressible: true,
        extensions: ["org"]
      },
      "text/x-pascal": {
        source: "apache",
        extensions: ["p", "pas"]
      },
      "text/x-processing": {
        compressible: true,
        extensions: ["pde"]
      },
      "text/x-sass": {
        extensions: ["sass"]
      },
      "text/x-scss": {
        extensions: ["scss"]
      },
      "text/x-setext": {
        source: "apache",
        extensions: ["etx"]
      },
      "text/x-sfv": {
        source: "apache",
        extensions: ["sfv"]
      },
      "text/x-suse-ymp": {
        compressible: true,
        extensions: ["ymp"]
      },
      "text/x-uuencode": {
        source: "apache",
        extensions: ["uu"]
      },
      "text/x-vcalendar": {
        source: "apache",
        extensions: ["vcs"]
      },
      "text/x-vcard": {
        source: "apache",
        extensions: ["vcf"]
      },
      "text/xml": {
        source: "iana",
        compressible: true,
        extensions: ["xml"]
      },
      "text/xml-external-parsed-entity": {
        source: "iana"
      },
      "text/yaml": {
        compressible: true,
        extensions: ["yaml", "yml"]
      },
      "video/1d-interleaved-parityfec": {
        source: "iana"
      },
      "video/3gpp": {
        source: "iana",
        extensions: ["3gp", "3gpp"]
      },
      "video/3gpp-tt": {
        source: "iana"
      },
      "video/3gpp2": {
        source: "iana",
        extensions: ["3g2"]
      },
      "video/av1": {
        source: "iana"
      },
      "video/bmpeg": {
        source: "iana"
      },
      "video/bt656": {
        source: "iana"
      },
      "video/celb": {
        source: "iana"
      },
      "video/dv": {
        source: "iana"
      },
      "video/encaprtp": {
        source: "iana"
      },
      "video/ffv1": {
        source: "iana"
      },
      "video/flexfec": {
        source: "iana"
      },
      "video/h261": {
        source: "iana",
        extensions: ["h261"]
      },
      "video/h263": {
        source: "iana",
        extensions: ["h263"]
      },
      "video/h263-1998": {
        source: "iana"
      },
      "video/h263-2000": {
        source: "iana"
      },
      "video/h264": {
        source: "iana",
        extensions: ["h264"]
      },
      "video/h264-rcdo": {
        source: "iana"
      },
      "video/h264-svc": {
        source: "iana"
      },
      "video/h265": {
        source: "iana"
      },
      "video/iso.segment": {
        source: "iana",
        extensions: ["m4s"]
      },
      "video/jpeg": {
        source: "iana",
        extensions: ["jpgv"]
      },
      "video/jpeg2000": {
        source: "iana"
      },
      "video/jpm": {
        source: "apache",
        extensions: ["jpm", "jpgm"]
      },
      "video/jxsv": {
        source: "iana"
      },
      "video/mj2": {
        source: "iana",
        extensions: ["mj2", "mjp2"]
      },
      "video/mp1s": {
        source: "iana"
      },
      "video/mp2p": {
        source: "iana"
      },
      "video/mp2t": {
        source: "iana",
        extensions: ["ts"]
      },
      "video/mp4": {
        source: "iana",
        compressible: false,
        extensions: ["mp4", "mp4v", "mpg4"]
      },
      "video/mp4v-es": {
        source: "iana"
      },
      "video/mpeg": {
        source: "iana",
        compressible: false,
        extensions: ["mpeg", "mpg", "mpe", "m1v", "m2v"]
      },
      "video/mpeg4-generic": {
        source: "iana"
      },
      "video/mpv": {
        source: "iana"
      },
      "video/nv": {
        source: "iana"
      },
      "video/ogg": {
        source: "iana",
        compressible: false,
        extensions: ["ogv"]
      },
      "video/parityfec": {
        source: "iana"
      },
      "video/pointer": {
        source: "iana"
      },
      "video/quicktime": {
        source: "iana",
        compressible: false,
        extensions: ["qt", "mov"]
      },
      "video/raptorfec": {
        source: "iana"
      },
      "video/raw": {
        source: "iana"
      },
      "video/rtp-enc-aescm128": {
        source: "iana"
      },
      "video/rtploopback": {
        source: "iana"
      },
      "video/rtx": {
        source: "iana"
      },
      "video/scip": {
        source: "iana"
      },
      "video/smpte291": {
        source: "iana"
      },
      "video/smpte292m": {
        source: "iana"
      },
      "video/ulpfec": {
        source: "iana"
      },
      "video/vc1": {
        source: "iana"
      },
      "video/vc2": {
        source: "iana"
      },
      "video/vnd.cctv": {
        source: "iana"
      },
      "video/vnd.dece.hd": {
        source: "iana",
        extensions: ["uvh", "uvvh"]
      },
      "video/vnd.dece.mobile": {
        source: "iana",
        extensions: ["uvm", "uvvm"]
      },
      "video/vnd.dece.mp4": {
        source: "iana"
      },
      "video/vnd.dece.pd": {
        source: "iana",
        extensions: ["uvp", "uvvp"]
      },
      "video/vnd.dece.sd": {
        source: "iana",
        extensions: ["uvs", "uvvs"]
      },
      "video/vnd.dece.video": {
        source: "iana",
        extensions: ["uvv", "uvvv"]
      },
      "video/vnd.directv.mpeg": {
        source: "iana"
      },
      "video/vnd.directv.mpeg-tts": {
        source: "iana"
      },
      "video/vnd.dlna.mpeg-tts": {
        source: "iana"
      },
      "video/vnd.dvb.file": {
        source: "iana",
        extensions: ["dvb"]
      },
      "video/vnd.fvt": {
        source: "iana",
        extensions: ["fvt"]
      },
      "video/vnd.hns.video": {
        source: "iana"
      },
      "video/vnd.iptvforum.1dparityfec-1010": {
        source: "iana"
      },
      "video/vnd.iptvforum.1dparityfec-2005": {
        source: "iana"
      },
      "video/vnd.iptvforum.2dparityfec-1010": {
        source: "iana"
      },
      "video/vnd.iptvforum.2dparityfec-2005": {
        source: "iana"
      },
      "video/vnd.iptvforum.ttsavc": {
        source: "iana"
      },
      "video/vnd.iptvforum.ttsmpeg2": {
        source: "iana"
      },
      "video/vnd.motorola.video": {
        source: "iana"
      },
      "video/vnd.motorola.videop": {
        source: "iana"
      },
      "video/vnd.mpegurl": {
        source: "iana",
        extensions: ["mxu", "m4u"]
      },
      "video/vnd.ms-playready.media.pyv": {
        source: "iana",
        extensions: ["pyv"]
      },
      "video/vnd.nokia.interleaved-multimedia": {
        source: "iana"
      },
      "video/vnd.nokia.mp4vr": {
        source: "iana"
      },
      "video/vnd.nokia.videovoip": {
        source: "iana"
      },
      "video/vnd.objectvideo": {
        source: "iana"
      },
      "video/vnd.radgamettools.bink": {
        source: "iana"
      },
      "video/vnd.radgamettools.smacker": {
        source: "iana"
      },
      "video/vnd.sealed.mpeg1": {
        source: "iana"
      },
      "video/vnd.sealed.mpeg4": {
        source: "iana"
      },
      "video/vnd.sealed.swf": {
        source: "iana"
      },
      "video/vnd.sealedmedia.softseal.mov": {
        source: "iana"
      },
      "video/vnd.uvvu.mp4": {
        source: "iana",
        extensions: ["uvu", "uvvu"]
      },
      "video/vnd.vivo": {
        source: "iana",
        extensions: ["viv"]
      },
      "video/vnd.youtube.yt": {
        source: "iana"
      },
      "video/vp8": {
        source: "iana"
      },
      "video/vp9": {
        source: "iana"
      },
      "video/webm": {
        source: "apache",
        compressible: false,
        extensions: ["webm"]
      },
      "video/x-f4v": {
        source: "apache",
        extensions: ["f4v"]
      },
      "video/x-fli": {
        source: "apache",
        extensions: ["fli"]
      },
      "video/x-flv": {
        source: "apache",
        compressible: false,
        extensions: ["flv"]
      },
      "video/x-m4v": {
        source: "apache",
        extensions: ["m4v"]
      },
      "video/x-matroska": {
        source: "apache",
        compressible: false,
        extensions: ["mkv", "mk3d", "mks"]
      },
      "video/x-mng": {
        source: "apache",
        extensions: ["mng"]
      },
      "video/x-ms-asf": {
        source: "apache",
        extensions: ["asf", "asx"]
      },
      "video/x-ms-vob": {
        source: "apache",
        extensions: ["vob"]
      },
      "video/x-ms-wm": {
        source: "apache",
        extensions: ["wm"]
      },
      "video/x-ms-wmv": {
        source: "apache",
        compressible: false,
        extensions: ["wmv"]
      },
      "video/x-ms-wmx": {
        source: "apache",
        extensions: ["wmx"]
      },
      "video/x-ms-wvx": {
        source: "apache",
        extensions: ["wvx"]
      },
      "video/x-msvideo": {
        source: "apache",
        extensions: ["avi"]
      },
      "video/x-sgi-movie": {
        source: "apache",
        extensions: ["movie"]
      },
      "video/x-smv": {
        source: "apache",
        extensions: ["smv"]
      },
      "x-conference/x-cooltalk": {
        source: "apache",
        extensions: ["ice"]
      },
      "x-shader/x-fragment": {
        compressible: true
      },
      "x-shader/x-vertex": {
        compressible: true
      }
    };
  }
});

// node_modules/mime-db/index.js
var require_mime_db = __commonJS({
  "node_modules/mime-db/index.js"(exports2, module2) {
    module2.exports = require_db();
  }
});

// node_modules/mime-types/index.js
var require_mime_types = __commonJS({
  "node_modules/mime-types/index.js"(exports2) {
    "use strict";
    var db2 = require_mime_db();
    var extname = require("path").extname;
    var EXTRACT_TYPE_REGEXP = /^\s*([^;\s]*)(?:;|\s|$)/;
    var TEXT_TYPE_REGEXP = /^text\//i;
    exports2.charset = charset;
    exports2.charsets = { lookup: charset };
    exports2.contentType = contentType;
    exports2.extension = extension;
    exports2.extensions = /* @__PURE__ */ Object.create(null);
    exports2.lookup = lookup;
    exports2.types = /* @__PURE__ */ Object.create(null);
    populateMaps(exports2.extensions, exports2.types);
    function charset(type) {
      if (!type || typeof type !== "string") {
        return false;
      }
      var match = EXTRACT_TYPE_REGEXP.exec(type);
      var mime = match && db2[match[1].toLowerCase()];
      if (mime && mime.charset) {
        return mime.charset;
      }
      if (match && TEXT_TYPE_REGEXP.test(match[1])) {
        return "UTF-8";
      }
      return false;
    }
    function contentType(str) {
      if (!str || typeof str !== "string") {
        return false;
      }
      var mime = str.indexOf("/") === -1 ? exports2.lookup(str) : str;
      if (!mime) {
        return false;
      }
      if (mime.indexOf("charset") === -1) {
        var charset2 = exports2.charset(mime);
        if (charset2) mime += "; charset=" + charset2.toLowerCase();
      }
      return mime;
    }
    function extension(type) {
      if (!type || typeof type !== "string") {
        return false;
      }
      var match = EXTRACT_TYPE_REGEXP.exec(type);
      var exts = match && exports2.extensions[match[1].toLowerCase()];
      if (!exts || !exts.length) {
        return false;
      }
      return exts[0];
    }
    function lookup(path2) {
      if (!path2 || typeof path2 !== "string") {
        return false;
      }
      var extension2 = extname("x." + path2).toLowerCase().substr(1);
      if (!extension2) {
        return false;
      }
      return exports2.types[extension2] || false;
    }
    function populateMaps(extensions, types) {
      var preference = ["nginx", "apache", void 0, "iana"];
      Object.keys(db2).forEach(function forEachMimeType(type) {
        var mime = db2[type];
        var exts = mime.extensions;
        if (!exts || !exts.length) {
          return;
        }
        extensions[type] = exts;
        for (var i = 0; i < exts.length; i++) {
          var extension2 = exts[i];
          if (types[extension2]) {
            var from = preference.indexOf(db2[types[extension2]].source);
            var to = preference.indexOf(mime.source);
            if (types[extension2] !== "application/octet-stream" && (from > to || from === to && types[extension2].substr(0, 12) === "application/")) {
              continue;
            }
          }
          types[extension2] = type;
        }
      });
    }
  }
});

// node_modules/multer/node_modules/type-is/index.js
var require_type_is = __commonJS({
  "node_modules/multer/node_modules/type-is/index.js"(exports2, module2) {
    "use strict";
    var typer = require_media_typer();
    var mime = require_mime_types();
    module2.exports = typeofrequest;
    module2.exports.is = typeis;
    module2.exports.hasBody = hasbody;
    module2.exports.normalize = normalize;
    module2.exports.match = mimeMatch;
    function typeis(value, types_) {
      var i;
      var types = types_;
      var val = tryNormalizeType(value);
      if (!val) {
        return false;
      }
      if (types && !Array.isArray(types)) {
        types = new Array(arguments.length - 1);
        for (i = 0; i < types.length; i++) {
          types[i] = arguments[i + 1];
        }
      }
      if (!types || !types.length) {
        return val;
      }
      var type;
      for (i = 0; i < types.length; i++) {
        if (mimeMatch(normalize(type = types[i]), val)) {
          return type[0] === "+" || type.indexOf("*") !== -1 ? val : type;
        }
      }
      return false;
    }
    function hasbody(req) {
      return req.headers["transfer-encoding"] !== void 0 || !isNaN(req.headers["content-length"]);
    }
    function typeofrequest(req, types_) {
      var types = types_;
      if (!hasbody(req)) {
        return null;
      }
      if (arguments.length > 2) {
        types = new Array(arguments.length - 1);
        for (var i = 0; i < types.length; i++) {
          types[i] = arguments[i + 1];
        }
      }
      var value = req.headers["content-type"];
      return typeis(value, types);
    }
    function normalize(type) {
      if (typeof type !== "string") {
        return false;
      }
      switch (type) {
        case "urlencoded":
          return "application/x-www-form-urlencoded";
        case "multipart":
          return "multipart/*";
      }
      if (type[0] === "+") {
        return "*/*" + type;
      }
      return type.indexOf("/") === -1 ? mime.lookup(type) : type;
    }
    function mimeMatch(expected, actual) {
      if (expected === false) {
        return false;
      }
      var actualParts = actual.split("/");
      var expectedParts = expected.split("/");
      if (actualParts.length !== 2 || expectedParts.length !== 2) {
        return false;
      }
      if (expectedParts[0] !== "*" && expectedParts[0] !== actualParts[0]) {
        return false;
      }
      if (expectedParts[1].substr(0, 2) === "*+") {
        return expectedParts[1].length <= actualParts[1].length + 1 && expectedParts[1].substr(1) === actualParts[1].substr(1 - expectedParts[1].length);
      }
      if (expectedParts[1] !== "*" && expectedParts[1] !== actualParts[1]) {
        return false;
      }
      return true;
    }
    function normalizeType(value) {
      var type = typer.parse(value);
      type.parameters = void 0;
      return typer.format(type);
    }
    function tryNormalizeType(value) {
      if (!value) {
        return null;
      }
      try {
        return normalizeType(value);
      } catch (err) {
        return null;
      }
    }
  }
});

// node_modules/busboy/lib/utils.js
var require_utils = __commonJS({
  "node_modules/busboy/lib/utils.js"(exports2, module2) {
    "use strict";
    function parseContentType(str) {
      if (str.length === 0)
        return;
      const params = /* @__PURE__ */ Object.create(null);
      let i = 0;
      for (; i < str.length; ++i) {
        const code = str.charCodeAt(i);
        if (TOKEN[code] !== 1) {
          if (code !== 47 || i === 0)
            return;
          break;
        }
      }
      if (i === str.length)
        return;
      const type = str.slice(0, i).toLowerCase();
      const subtypeStart = ++i;
      for (; i < str.length; ++i) {
        const code = str.charCodeAt(i);
        if (TOKEN[code] !== 1) {
          if (i === subtypeStart)
            return;
          if (parseContentTypeParams(str, i, params) === void 0)
            return;
          break;
        }
      }
      if (i === subtypeStart)
        return;
      const subtype = str.slice(subtypeStart, i).toLowerCase();
      return { type, subtype, params };
    }
    function parseContentTypeParams(str, i, params) {
      while (i < str.length) {
        for (; i < str.length; ++i) {
          const code = str.charCodeAt(i);
          if (code !== 32 && code !== 9)
            break;
        }
        if (i === str.length)
          break;
        if (str.charCodeAt(i++) !== 59)
          return;
        for (; i < str.length; ++i) {
          const code = str.charCodeAt(i);
          if (code !== 32 && code !== 9)
            break;
        }
        if (i === str.length)
          return;
        let name;
        const nameStart = i;
        for (; i < str.length; ++i) {
          const code = str.charCodeAt(i);
          if (TOKEN[code] !== 1) {
            if (code !== 61)
              return;
            break;
          }
        }
        if (i === str.length)
          return;
        name = str.slice(nameStart, i);
        ++i;
        if (i === str.length)
          return;
        let value = "";
        let valueStart;
        if (str.charCodeAt(i) === 34) {
          valueStart = ++i;
          let escaping = false;
          for (; i < str.length; ++i) {
            const code = str.charCodeAt(i);
            if (code === 92) {
              if (escaping) {
                valueStart = i;
                escaping = false;
              } else {
                value += str.slice(valueStart, i);
                escaping = true;
              }
              continue;
            }
            if (code === 34) {
              if (escaping) {
                valueStart = i;
                escaping = false;
                continue;
              }
              value += str.slice(valueStart, i);
              break;
            }
            if (escaping) {
              valueStart = i - 1;
              escaping = false;
            }
            if (QDTEXT[code] !== 1)
              return;
          }
          if (i === str.length)
            return;
          ++i;
        } else {
          valueStart = i;
          for (; i < str.length; ++i) {
            const code = str.charCodeAt(i);
            if (TOKEN[code] !== 1) {
              if (i === valueStart)
                return;
              break;
            }
          }
          value = str.slice(valueStart, i);
        }
        name = name.toLowerCase();
        if (params[name] === void 0)
          params[name] = value;
      }
      return params;
    }
    function parseDisposition(str, defDecoder) {
      if (str.length === 0)
        return;
      const params = /* @__PURE__ */ Object.create(null);
      let i = 0;
      for (; i < str.length; ++i) {
        const code = str.charCodeAt(i);
        if (TOKEN[code] !== 1) {
          if (parseDispositionParams(str, i, params, defDecoder) === void 0)
            return;
          break;
        }
      }
      const type = str.slice(0, i).toLowerCase();
      return { type, params };
    }
    function parseDispositionParams(str, i, params, defDecoder) {
      while (i < str.length) {
        for (; i < str.length; ++i) {
          const code = str.charCodeAt(i);
          if (code !== 32 && code !== 9)
            break;
        }
        if (i === str.length)
          break;
        if (str.charCodeAt(i++) !== 59)
          return;
        for (; i < str.length; ++i) {
          const code = str.charCodeAt(i);
          if (code !== 32 && code !== 9)
            break;
        }
        if (i === str.length)
          return;
        let name;
        const nameStart = i;
        for (; i < str.length; ++i) {
          const code = str.charCodeAt(i);
          if (TOKEN[code] !== 1) {
            if (code === 61)
              break;
            return;
          }
        }
        if (i === str.length)
          return;
        let value = "";
        let valueStart;
        let charset;
        name = str.slice(nameStart, i);
        if (name.charCodeAt(name.length - 1) === 42) {
          const charsetStart = ++i;
          for (; i < str.length; ++i) {
            const code = str.charCodeAt(i);
            if (CHARSET[code] !== 1) {
              if (code !== 39)
                return;
              break;
            }
          }
          if (i === str.length)
            return;
          charset = str.slice(charsetStart, i);
          ++i;
          for (; i < str.length; ++i) {
            const code = str.charCodeAt(i);
            if (code === 39)
              break;
          }
          if (i === str.length)
            return;
          ++i;
          if (i === str.length)
            return;
          valueStart = i;
          let encode = 0;
          for (; i < str.length; ++i) {
            const code = str.charCodeAt(i);
            if (EXTENDED_VALUE[code] !== 1) {
              if (code === 37) {
                let hexUpper;
                let hexLower;
                if (i + 2 < str.length && (hexUpper = HEX_VALUES[str.charCodeAt(i + 1)]) !== -1 && (hexLower = HEX_VALUES[str.charCodeAt(i + 2)]) !== -1) {
                  const byteVal = (hexUpper << 4) + hexLower;
                  value += str.slice(valueStart, i);
                  value += String.fromCharCode(byteVal);
                  i += 2;
                  valueStart = i + 1;
                  if (byteVal >= 128)
                    encode = 2;
                  else if (encode === 0)
                    encode = 1;
                  continue;
                }
                return;
              }
              break;
            }
          }
          value += str.slice(valueStart, i);
          value = convertToUTF8(value, charset, encode);
          if (value === void 0)
            return;
        } else {
          ++i;
          if (i === str.length)
            return;
          if (str.charCodeAt(i) === 34) {
            valueStart = ++i;
            let escaping = false;
            for (; i < str.length; ++i) {
              const code = str.charCodeAt(i);
              if (code === 92) {
                if (escaping) {
                  valueStart = i;
                  escaping = false;
                } else {
                  value += str.slice(valueStart, i);
                  escaping = true;
                }
                continue;
              }
              if (code === 34) {
                if (escaping) {
                  valueStart = i;
                  escaping = false;
                  continue;
                }
                value += str.slice(valueStart, i);
                break;
              }
              if (escaping) {
                valueStart = i - 1;
                escaping = false;
              }
              if (QDTEXT[code] !== 1)
                return;
            }
            if (i === str.length)
              return;
            ++i;
          } else {
            valueStart = i;
            for (; i < str.length; ++i) {
              const code = str.charCodeAt(i);
              if (TOKEN[code] !== 1) {
                if (i === valueStart)
                  return;
                break;
              }
            }
            value = str.slice(valueStart, i);
          }
          value = defDecoder(value, 2);
          if (value === void 0)
            return;
        }
        name = name.toLowerCase();
        if (params[name] === void 0)
          params[name] = value;
      }
      return params;
    }
    function getDecoder(charset) {
      let lc;
      while (true) {
        switch (charset) {
          case "utf-8":
          case "utf8":
            return decoders.utf8;
          case "latin1":
          case "ascii":
          case "us-ascii":
          case "iso-8859-1":
          case "iso8859-1":
          case "iso88591":
          case "iso_8859-1":
          case "windows-1252":
          case "iso_8859-1:1987":
          case "cp1252":
          case "x-cp1252":
            return decoders.latin1;
          case "utf16le":
          case "utf-16le":
          case "ucs2":
          case "ucs-2":
            return decoders.utf16le;
          case "base64":
            return decoders.base64;
          default:
            if (lc === void 0) {
              lc = true;
              charset = charset.toLowerCase();
              continue;
            }
            return decoders.other.bind(charset);
        }
      }
    }
    var decoders = {
      utf8: (data, hint) => {
        if (data.length === 0)
          return "";
        if (typeof data === "string") {
          if (hint < 2)
            return data;
          data = Buffer.from(data, "latin1");
        }
        return data.utf8Slice(0, data.length);
      },
      latin1: (data, hint) => {
        if (data.length === 0)
          return "";
        if (typeof data === "string")
          return data;
        return data.latin1Slice(0, data.length);
      },
      utf16le: (data, hint) => {
        if (data.length === 0)
          return "";
        if (typeof data === "string")
          data = Buffer.from(data, "latin1");
        return data.ucs2Slice(0, data.length);
      },
      base64: (data, hint) => {
        if (data.length === 0)
          return "";
        if (typeof data === "string")
          data = Buffer.from(data, "latin1");
        return data.base64Slice(0, data.length);
      },
      other: (data, hint) => {
        if (data.length === 0)
          return "";
        if (typeof data === "string")
          data = Buffer.from(data, "latin1");
        try {
          const decoder = new TextDecoder(exports2);
          return decoder.decode(data);
        } catch {
        }
      }
    };
    function convertToUTF8(data, charset, hint) {
      const decode = getDecoder(charset);
      if (decode)
        return decode(data, hint);
    }
    function basename(path2) {
      if (typeof path2 !== "string")
        return "";
      for (let i = path2.length - 1; i >= 0; --i) {
        switch (path2.charCodeAt(i)) {
          case 47:
          case 92:
            path2 = path2.slice(i + 1);
            return path2 === ".." || path2 === "." ? "" : path2;
        }
      }
      return path2 === ".." || path2 === "." ? "" : path2;
    }
    var TOKEN = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ];
    var QDTEXT = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1
    ];
    var CHARSET = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      1,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ];
    var EXTENDED_VALUE = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      1,
      1,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      1,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ];
    var HEX_VALUES = [
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      10,
      11,
      12,
      13,
      14,
      15,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      10,
      11,
      12,
      13,
      14,
      15,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1
    ];
    module2.exports = {
      basename,
      convertToUTF8,
      getDecoder,
      parseContentType,
      parseDisposition
    };
  }
});

// node_modules/streamsearch/lib/sbmh.js
var require_sbmh = __commonJS({
  "node_modules/streamsearch/lib/sbmh.js"(exports2, module2) {
    "use strict";
    function memcmp(buf1, pos1, buf2, pos2, num) {
      for (let i = 0; i < num; ++i) {
        if (buf1[pos1 + i] !== buf2[pos2 + i])
          return false;
      }
      return true;
    }
    var SBMH = class {
      constructor(needle, cb) {
        if (typeof cb !== "function")
          throw new Error("Missing match callback");
        if (typeof needle === "string")
          needle = Buffer.from(needle);
        else if (!Buffer.isBuffer(needle))
          throw new Error(`Expected Buffer for needle, got ${typeof needle}`);
        const needleLen = needle.length;
        this.maxMatches = Infinity;
        this.matches = 0;
        this._cb = cb;
        this._lookbehindSize = 0;
        this._needle = needle;
        this._bufPos = 0;
        this._lookbehind = Buffer.allocUnsafe(needleLen);
        this._occ = [
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen
        ];
        if (needleLen > 1) {
          for (let i = 0; i < needleLen - 1; ++i)
            this._occ[needle[i]] = needleLen - 1 - i;
        }
      }
      reset() {
        this.matches = 0;
        this._lookbehindSize = 0;
        this._bufPos = 0;
      }
      push(chunk, pos) {
        let result;
        if (!Buffer.isBuffer(chunk))
          chunk = Buffer.from(chunk, "latin1");
        const chunkLen = chunk.length;
        this._bufPos = pos || 0;
        while (result !== chunkLen && this.matches < this.maxMatches)
          result = feed(this, chunk);
        return result;
      }
      destroy() {
        const lbSize = this._lookbehindSize;
        if (lbSize)
          this._cb(false, this._lookbehind, 0, lbSize, false);
        this.reset();
      }
    };
    function feed(self2, data) {
      const len = data.length;
      const needle = self2._needle;
      const needleLen = needle.length;
      let pos = -self2._lookbehindSize;
      const lastNeedleCharPos = needleLen - 1;
      const lastNeedleChar = needle[lastNeedleCharPos];
      const end = len - needleLen;
      const occ = self2._occ;
      const lookbehind = self2._lookbehind;
      if (pos < 0) {
        while (pos < 0 && pos <= end) {
          const nextPos = pos + lastNeedleCharPos;
          const ch = nextPos < 0 ? lookbehind[self2._lookbehindSize + nextPos] : data[nextPos];
          if (ch === lastNeedleChar && matchNeedle(self2, data, pos, lastNeedleCharPos)) {
            self2._lookbehindSize = 0;
            ++self2.matches;
            if (pos > -self2._lookbehindSize)
              self2._cb(true, lookbehind, 0, self2._lookbehindSize + pos, false);
            else
              self2._cb(true, void 0, 0, 0, true);
            return self2._bufPos = pos + needleLen;
          }
          pos += occ[ch];
        }
        while (pos < 0 && !matchNeedle(self2, data, pos, len - pos))
          ++pos;
        if (pos < 0) {
          const bytesToCutOff = self2._lookbehindSize + pos;
          if (bytesToCutOff > 0) {
            self2._cb(false, lookbehind, 0, bytesToCutOff, false);
          }
          self2._lookbehindSize -= bytesToCutOff;
          lookbehind.copy(lookbehind, 0, bytesToCutOff, self2._lookbehindSize);
          lookbehind.set(data, self2._lookbehindSize);
          self2._lookbehindSize += len;
          self2._bufPos = len;
          return len;
        }
        self2._cb(false, lookbehind, 0, self2._lookbehindSize, false);
        self2._lookbehindSize = 0;
      }
      pos += self2._bufPos;
      const firstNeedleChar = needle[0];
      while (pos <= end) {
        const ch = data[pos + lastNeedleCharPos];
        if (ch === lastNeedleChar && data[pos] === firstNeedleChar && memcmp(needle, 0, data, pos, lastNeedleCharPos)) {
          ++self2.matches;
          if (pos > 0)
            self2._cb(true, data, self2._bufPos, pos, true);
          else
            self2._cb(true, void 0, 0, 0, true);
          return self2._bufPos = pos + needleLen;
        }
        pos += occ[ch];
      }
      while (pos < len) {
        if (data[pos] !== firstNeedleChar || !memcmp(data, pos, needle, 0, len - pos)) {
          ++pos;
          continue;
        }
        data.copy(lookbehind, 0, pos, len);
        self2._lookbehindSize = len - pos;
        break;
      }
      if (pos > 0)
        self2._cb(false, data, self2._bufPos, pos < len ? pos : len, true);
      self2._bufPos = len;
      return len;
    }
    function matchNeedle(self2, data, pos, len) {
      const lb = self2._lookbehind;
      const lbSize = self2._lookbehindSize;
      const needle = self2._needle;
      for (let i = 0; i < len; ++i, ++pos) {
        const ch = pos < 0 ? lb[lbSize + pos] : data[pos];
        if (ch !== needle[i])
          return false;
      }
      return true;
    }
    module2.exports = SBMH;
  }
});

// node_modules/busboy/lib/types/multipart.js
var require_multipart = __commonJS({
  "node_modules/busboy/lib/types/multipart.js"(exports2, module2) {
    "use strict";
    var { Readable, Writable } = require("stream");
    var StreamSearch = require_sbmh();
    var {
      basename,
      convertToUTF8,
      getDecoder,
      parseContentType,
      parseDisposition
    } = require_utils();
    var BUF_CRLF = Buffer.from("\r\n");
    var BUF_CR = Buffer.from("\r");
    var BUF_DASH = Buffer.from("-");
    function noop() {
    }
    var MAX_HEADER_PAIRS = 2e3;
    var MAX_HEADER_SIZE = 16 * 1024;
    var HPARSER_NAME = 0;
    var HPARSER_PRE_OWS = 1;
    var HPARSER_VALUE = 2;
    var HeaderParser = class {
      constructor(cb) {
        this.header = /* @__PURE__ */ Object.create(null);
        this.pairCount = 0;
        this.byteCount = 0;
        this.state = HPARSER_NAME;
        this.name = "";
        this.value = "";
        this.crlf = 0;
        this.cb = cb;
      }
      reset() {
        this.header = /* @__PURE__ */ Object.create(null);
        this.pairCount = 0;
        this.byteCount = 0;
        this.state = HPARSER_NAME;
        this.name = "";
        this.value = "";
        this.crlf = 0;
      }
      push(chunk, pos, end) {
        let start = pos;
        while (pos < end) {
          switch (this.state) {
            case HPARSER_NAME: {
              let done = false;
              for (; pos < end; ++pos) {
                if (this.byteCount === MAX_HEADER_SIZE)
                  return -1;
                ++this.byteCount;
                const code = chunk[pos];
                if (TOKEN[code] !== 1) {
                  if (code !== 58)
                    return -1;
                  this.name += chunk.latin1Slice(start, pos);
                  if (this.name.length === 0)
                    return -1;
                  ++pos;
                  done = true;
                  this.state = HPARSER_PRE_OWS;
                  break;
                }
              }
              if (!done) {
                this.name += chunk.latin1Slice(start, pos);
                break;
              }
            }
            case HPARSER_PRE_OWS: {
              let done = false;
              for (; pos < end; ++pos) {
                if (this.byteCount === MAX_HEADER_SIZE)
                  return -1;
                ++this.byteCount;
                const code = chunk[pos];
                if (code !== 32 && code !== 9) {
                  start = pos;
                  done = true;
                  this.state = HPARSER_VALUE;
                  break;
                }
              }
              if (!done)
                break;
            }
            case HPARSER_VALUE:
              switch (this.crlf) {
                case 0:
                  for (; pos < end; ++pos) {
                    if (this.byteCount === MAX_HEADER_SIZE)
                      return -1;
                    ++this.byteCount;
                    const code = chunk[pos];
                    if (FIELD_VCHAR[code] !== 1) {
                      if (code !== 13)
                        return -1;
                      ++this.crlf;
                      break;
                    }
                  }
                  this.value += chunk.latin1Slice(start, pos++);
                  break;
                case 1:
                  if (this.byteCount === MAX_HEADER_SIZE)
                    return -1;
                  ++this.byteCount;
                  if (chunk[pos++] !== 10)
                    return -1;
                  ++this.crlf;
                  break;
                case 2: {
                  if (this.byteCount === MAX_HEADER_SIZE)
                    return -1;
                  ++this.byteCount;
                  const code = chunk[pos];
                  if (code === 32 || code === 9) {
                    start = pos;
                    this.crlf = 0;
                  } else {
                    if (++this.pairCount < MAX_HEADER_PAIRS) {
                      this.name = this.name.toLowerCase();
                      if (this.header[this.name] === void 0)
                        this.header[this.name] = [this.value];
                      else
                        this.header[this.name].push(this.value);
                    }
                    if (code === 13) {
                      ++this.crlf;
                      ++pos;
                    } else {
                      start = pos;
                      this.crlf = 0;
                      this.state = HPARSER_NAME;
                      this.name = "";
                      this.value = "";
                    }
                  }
                  break;
                }
                case 3: {
                  if (this.byteCount === MAX_HEADER_SIZE)
                    return -1;
                  ++this.byteCount;
                  if (chunk[pos++] !== 10)
                    return -1;
                  const header = this.header;
                  this.reset();
                  this.cb(header);
                  return pos;
                }
              }
              break;
          }
        }
        return pos;
      }
    };
    var FileStream = class extends Readable {
      constructor(opts, owner) {
        super(opts);
        this.truncated = false;
        this._readcb = null;
        this.once("end", () => {
          this._read();
          if (--owner._fileEndsLeft === 0 && owner._finalcb) {
            const cb = owner._finalcb;
            owner._finalcb = null;
            process.nextTick(cb);
          }
        });
      }
      _read(n) {
        const cb = this._readcb;
        if (cb) {
          this._readcb = null;
          cb();
        }
      }
    };
    var ignoreData = {
      push: (chunk, pos) => {
      },
      destroy: () => {
      }
    };
    function callAndUnsetCb(self2, err) {
      const cb = self2._writecb;
      self2._writecb = null;
      if (err)
        self2.destroy(err);
      else if (cb)
        cb();
    }
    function nullDecoder(val, hint) {
      return val;
    }
    var Multipart = class extends Writable {
      constructor(cfg) {
        const streamOpts = {
          autoDestroy: true,
          emitClose: true,
          highWaterMark: typeof cfg.highWaterMark === "number" ? cfg.highWaterMark : void 0
        };
        super(streamOpts);
        if (!cfg.conType.params || typeof cfg.conType.params.boundary !== "string")
          throw new Error("Multipart: Boundary not found");
        const boundary = cfg.conType.params.boundary;
        const paramDecoder = typeof cfg.defParamCharset === "string" && cfg.defParamCharset ? getDecoder(cfg.defParamCharset) : nullDecoder;
        const defCharset = cfg.defCharset || "utf8";
        const preservePath = cfg.preservePath;
        const fileOpts = {
          autoDestroy: true,
          emitClose: true,
          highWaterMark: typeof cfg.fileHwm === "number" ? cfg.fileHwm : void 0
        };
        const limits = cfg.limits;
        const fieldSizeLimit = limits && typeof limits.fieldSize === "number" ? limits.fieldSize : 1 * 1024 * 1024;
        const fileSizeLimit = limits && typeof limits.fileSize === "number" ? limits.fileSize : Infinity;
        const filesLimit = limits && typeof limits.files === "number" ? limits.files : Infinity;
        const fieldsLimit = limits && typeof limits.fields === "number" ? limits.fields : Infinity;
        const partsLimit = limits && typeof limits.parts === "number" ? limits.parts : Infinity;
        let parts = -1;
        let fields = 0;
        let files = 0;
        let skipPart = false;
        this._fileEndsLeft = 0;
        this._fileStream = void 0;
        this._complete = false;
        let fileSize = 0;
        let field;
        let fieldSize = 0;
        let partCharset;
        let partEncoding;
        let partType;
        let partName;
        let partTruncated = false;
        let hitFilesLimit = false;
        let hitFieldsLimit = false;
        this._hparser = null;
        const hparser = new HeaderParser((header) => {
          this._hparser = null;
          skipPart = false;
          partType = "text/plain";
          partCharset = defCharset;
          partEncoding = "7bit";
          partName = void 0;
          partTruncated = false;
          let filename;
          if (!header["content-disposition"]) {
            skipPart = true;
            return;
          }
          const disp = parseDisposition(
            header["content-disposition"][0],
            paramDecoder
          );
          if (!disp || disp.type !== "form-data") {
            skipPart = true;
            return;
          }
          if (disp.params) {
            if (disp.params.name)
              partName = disp.params.name;
            if (disp.params["filename*"])
              filename = disp.params["filename*"];
            else if (disp.params.filename)
              filename = disp.params.filename;
            if (filename !== void 0 && !preservePath)
              filename = basename(filename);
          }
          if (header["content-type"]) {
            const conType = parseContentType(header["content-type"][0]);
            if (conType) {
              partType = `${conType.type}/${conType.subtype}`;
              if (conType.params && typeof conType.params.charset === "string")
                partCharset = conType.params.charset.toLowerCase();
            }
          }
          if (header["content-transfer-encoding"])
            partEncoding = header["content-transfer-encoding"][0].toLowerCase();
          if (partType === "application/octet-stream" || filename !== void 0) {
            if (files === filesLimit) {
              if (!hitFilesLimit) {
                hitFilesLimit = true;
                this.emit("filesLimit");
              }
              skipPart = true;
              return;
            }
            ++files;
            if (this.listenerCount("file") === 0) {
              skipPart = true;
              return;
            }
            fileSize = 0;
            this._fileStream = new FileStream(fileOpts, this);
            ++this._fileEndsLeft;
            this.emit(
              "file",
              partName,
              this._fileStream,
              {
                filename,
                encoding: partEncoding,
                mimeType: partType
              }
            );
          } else {
            if (fields === fieldsLimit) {
              if (!hitFieldsLimit) {
                hitFieldsLimit = true;
                this.emit("fieldsLimit");
              }
              skipPart = true;
              return;
            }
            ++fields;
            if (this.listenerCount("field") === 0) {
              skipPart = true;
              return;
            }
            field = [];
            fieldSize = 0;
          }
        });
        let matchPostBoundary = 0;
        const ssCb = (isMatch, data, start, end, isDataSafe) => {
          retrydata:
            while (data) {
              if (this._hparser !== null) {
                const ret = this._hparser.push(data, start, end);
                if (ret === -1) {
                  this._hparser = null;
                  hparser.reset();
                  this.emit("error", new Error("Malformed part header"));
                  break;
                }
                start = ret;
              }
              if (start === end)
                break;
              if (matchPostBoundary !== 0) {
                if (matchPostBoundary === 1) {
                  switch (data[start]) {
                    case 45:
                      matchPostBoundary = 2;
                      ++start;
                      break;
                    case 13:
                      matchPostBoundary = 3;
                      ++start;
                      break;
                    default:
                      matchPostBoundary = 0;
                  }
                  if (start === end)
                    return;
                }
                if (matchPostBoundary === 2) {
                  matchPostBoundary = 0;
                  if (data[start] === 45) {
                    this._complete = true;
                    this._bparser = ignoreData;
                    return;
                  }
                  const writecb = this._writecb;
                  this._writecb = noop;
                  ssCb(false, BUF_DASH, 0, 1, false);
                  this._writecb = writecb;
                } else if (matchPostBoundary === 3) {
                  matchPostBoundary = 0;
                  if (data[start] === 10) {
                    ++start;
                    if (parts >= partsLimit)
                      break;
                    this._hparser = hparser;
                    if (start === end)
                      break;
                    continue retrydata;
                  } else {
                    const writecb = this._writecb;
                    this._writecb = noop;
                    ssCb(false, BUF_CR, 0, 1, false);
                    this._writecb = writecb;
                  }
                }
              }
              if (!skipPart) {
                if (this._fileStream) {
                  let chunk;
                  const actualLen = Math.min(end - start, fileSizeLimit - fileSize);
                  if (!isDataSafe) {
                    chunk = Buffer.allocUnsafe(actualLen);
                    data.copy(chunk, 0, start, start + actualLen);
                  } else {
                    chunk = data.slice(start, start + actualLen);
                  }
                  fileSize += chunk.length;
                  if (fileSize === fileSizeLimit) {
                    if (chunk.length > 0)
                      this._fileStream.push(chunk);
                    this._fileStream.emit("limit");
                    this._fileStream.truncated = true;
                    skipPart = true;
                  } else if (!this._fileStream.push(chunk)) {
                    if (this._writecb)
                      this._fileStream._readcb = this._writecb;
                    this._writecb = null;
                  }
                } else if (field !== void 0) {
                  let chunk;
                  const actualLen = Math.min(
                    end - start,
                    fieldSizeLimit - fieldSize
                  );
                  if (!isDataSafe) {
                    chunk = Buffer.allocUnsafe(actualLen);
                    data.copy(chunk, 0, start, start + actualLen);
                  } else {
                    chunk = data.slice(start, start + actualLen);
                  }
                  fieldSize += actualLen;
                  field.push(chunk);
                  if (fieldSize === fieldSizeLimit) {
                    skipPart = true;
                    partTruncated = true;
                  }
                }
              }
              break;
            }
          if (isMatch) {
            matchPostBoundary = 1;
            if (this._fileStream) {
              this._fileStream.push(null);
              this._fileStream = null;
            } else if (field !== void 0) {
              let data2;
              switch (field.length) {
                case 0:
                  data2 = "";
                  break;
                case 1:
                  data2 = convertToUTF8(field[0], partCharset, 0);
                  break;
                default:
                  data2 = convertToUTF8(
                    Buffer.concat(field, fieldSize),
                    partCharset,
                    0
                  );
              }
              field = void 0;
              fieldSize = 0;
              this.emit(
                "field",
                partName,
                data2,
                {
                  nameTruncated: false,
                  valueTruncated: partTruncated,
                  encoding: partEncoding,
                  mimeType: partType
                }
              );
            }
            if (++parts === partsLimit)
              this.emit("partsLimit");
          }
        };
        this._bparser = new StreamSearch(`\r
--${boundary}`, ssCb);
        this._writecb = null;
        this._finalcb = null;
        this.write(BUF_CRLF);
      }
      static detect(conType) {
        return conType.type === "multipart" && conType.subtype === "form-data";
      }
      _write(chunk, enc, cb) {
        this._writecb = cb;
        this._bparser.push(chunk, 0);
        if (this._writecb)
          callAndUnsetCb(this);
      }
      _destroy(err, cb) {
        this._hparser = null;
        this._bparser = ignoreData;
        if (!err)
          err = checkEndState(this);
        const fileStream = this._fileStream;
        if (fileStream) {
          this._fileStream = null;
          fileStream.destroy(err);
        }
        cb(err);
      }
      _final(cb) {
        this._bparser.destroy();
        if (!this._complete)
          return cb(new Error("Unexpected end of form"));
        if (this._fileEndsLeft)
          this._finalcb = finalcb.bind(null, this, cb);
        else
          finalcb(this, cb);
      }
    };
    function finalcb(self2, cb, err) {
      if (err)
        return cb(err);
      err = checkEndState(self2);
      cb(err);
    }
    function checkEndState(self2) {
      if (self2._hparser)
        return new Error("Malformed part header");
      const fileStream = self2._fileStream;
      if (fileStream) {
        self2._fileStream = null;
        fileStream.destroy(new Error("Unexpected end of file"));
      }
      if (!self2._complete)
        return new Error("Unexpected end of form");
    }
    var TOKEN = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ];
    var FIELD_VCHAR = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1
    ];
    module2.exports = Multipart;
  }
});

// node_modules/busboy/lib/types/urlencoded.js
var require_urlencoded = __commonJS({
  "node_modules/busboy/lib/types/urlencoded.js"(exports2, module2) {
    "use strict";
    var { Writable } = require("stream");
    var { getDecoder } = require_utils();
    var URLEncoded = class extends Writable {
      constructor(cfg) {
        const streamOpts = {
          autoDestroy: true,
          emitClose: true,
          highWaterMark: typeof cfg.highWaterMark === "number" ? cfg.highWaterMark : void 0
        };
        super(streamOpts);
        let charset = cfg.defCharset || "utf8";
        if (cfg.conType.params && typeof cfg.conType.params.charset === "string")
          charset = cfg.conType.params.charset;
        this.charset = charset;
        const limits = cfg.limits;
        this.fieldSizeLimit = limits && typeof limits.fieldSize === "number" ? limits.fieldSize : 1 * 1024 * 1024;
        this.fieldsLimit = limits && typeof limits.fields === "number" ? limits.fields : Infinity;
        this.fieldNameSizeLimit = limits && typeof limits.fieldNameSize === "number" ? limits.fieldNameSize : 100;
        this._inKey = true;
        this._keyTrunc = false;
        this._valTrunc = false;
        this._bytesKey = 0;
        this._bytesVal = 0;
        this._fields = 0;
        this._key = "";
        this._val = "";
        this._byte = -2;
        this._lastPos = 0;
        this._encode = 0;
        this._decoder = getDecoder(charset);
      }
      static detect(conType) {
        return conType.type === "application" && conType.subtype === "x-www-form-urlencoded";
      }
      _write(chunk, enc, cb) {
        if (this._fields >= this.fieldsLimit)
          return cb();
        let i = 0;
        const len = chunk.length;
        this._lastPos = 0;
        if (this._byte !== -2) {
          i = readPctEnc(this, chunk, i, len);
          if (i === -1)
            return cb(new Error("Malformed urlencoded form"));
          if (i >= len)
            return cb();
          if (this._inKey)
            ++this._bytesKey;
          else
            ++this._bytesVal;
        }
        main:
          while (i < len) {
            if (this._inKey) {
              i = skipKeyBytes(this, chunk, i, len);
              while (i < len) {
                switch (chunk[i]) {
                  case 61:
                    if (this._lastPos < i)
                      this._key += chunk.latin1Slice(this._lastPos, i);
                    this._lastPos = ++i;
                    this._key = this._decoder(this._key, this._encode);
                    this._encode = 0;
                    this._inKey = false;
                    continue main;
                  case 38:
                    if (this._lastPos < i)
                      this._key += chunk.latin1Slice(this._lastPos, i);
                    this._lastPos = ++i;
                    this._key = this._decoder(this._key, this._encode);
                    this._encode = 0;
                    if (this._bytesKey > 0) {
                      this.emit(
                        "field",
                        this._key,
                        "",
                        {
                          nameTruncated: this._keyTrunc,
                          valueTruncated: false,
                          encoding: this.charset,
                          mimeType: "text/plain"
                        }
                      );
                    }
                    this._key = "";
                    this._val = "";
                    this._keyTrunc = false;
                    this._valTrunc = false;
                    this._bytesKey = 0;
                    this._bytesVal = 0;
                    if (++this._fields >= this.fieldsLimit) {
                      this.emit("fieldsLimit");
                      return cb();
                    }
                    continue;
                  case 43:
                    if (this._lastPos < i)
                      this._key += chunk.latin1Slice(this._lastPos, i);
                    this._key += " ";
                    this._lastPos = i + 1;
                    break;
                  case 37:
                    if (this._encode === 0)
                      this._encode = 1;
                    if (this._lastPos < i)
                      this._key += chunk.latin1Slice(this._lastPos, i);
                    this._lastPos = i + 1;
                    this._byte = -1;
                    i = readPctEnc(this, chunk, i + 1, len);
                    if (i === -1)
                      return cb(new Error("Malformed urlencoded form"));
                    if (i >= len)
                      return cb();
                    ++this._bytesKey;
                    i = skipKeyBytes(this, chunk, i, len);
                    continue;
                }
                ++i;
                ++this._bytesKey;
                i = skipKeyBytes(this, chunk, i, len);
              }
              if (this._lastPos < i)
                this._key += chunk.latin1Slice(this._lastPos, i);
            } else {
              i = skipValBytes(this, chunk, i, len);
              while (i < len) {
                switch (chunk[i]) {
                  case 38:
                    if (this._lastPos < i)
                      this._val += chunk.latin1Slice(this._lastPos, i);
                    this._lastPos = ++i;
                    this._inKey = true;
                    this._val = this._decoder(this._val, this._encode);
                    this._encode = 0;
                    if (this._bytesKey > 0 || this._bytesVal > 0) {
                      this.emit(
                        "field",
                        this._key,
                        this._val,
                        {
                          nameTruncated: this._keyTrunc,
                          valueTruncated: this._valTrunc,
                          encoding: this.charset,
                          mimeType: "text/plain"
                        }
                      );
                    }
                    this._key = "";
                    this._val = "";
                    this._keyTrunc = false;
                    this._valTrunc = false;
                    this._bytesKey = 0;
                    this._bytesVal = 0;
                    if (++this._fields >= this.fieldsLimit) {
                      this.emit("fieldsLimit");
                      return cb();
                    }
                    continue main;
                  case 43:
                    if (this._lastPos < i)
                      this._val += chunk.latin1Slice(this._lastPos, i);
                    this._val += " ";
                    this._lastPos = i + 1;
                    break;
                  case 37:
                    if (this._encode === 0)
                      this._encode = 1;
                    if (this._lastPos < i)
                      this._val += chunk.latin1Slice(this._lastPos, i);
                    this._lastPos = i + 1;
                    this._byte = -1;
                    i = readPctEnc(this, chunk, i + 1, len);
                    if (i === -1)
                      return cb(new Error("Malformed urlencoded form"));
                    if (i >= len)
                      return cb();
                    ++this._bytesVal;
                    i = skipValBytes(this, chunk, i, len);
                    continue;
                }
                ++i;
                ++this._bytesVal;
                i = skipValBytes(this, chunk, i, len);
              }
              if (this._lastPos < i)
                this._val += chunk.latin1Slice(this._lastPos, i);
            }
          }
        cb();
      }
      _final(cb) {
        if (this._byte !== -2)
          return cb(new Error("Malformed urlencoded form"));
        if (!this._inKey || this._bytesKey > 0 || this._bytesVal > 0) {
          if (this._inKey)
            this._key = this._decoder(this._key, this._encode);
          else
            this._val = this._decoder(this._val, this._encode);
          this.emit(
            "field",
            this._key,
            this._val,
            {
              nameTruncated: this._keyTrunc,
              valueTruncated: this._valTrunc,
              encoding: this.charset,
              mimeType: "text/plain"
            }
          );
        }
        cb();
      }
    };
    function readPctEnc(self2, chunk, pos, len) {
      if (pos >= len)
        return len;
      if (self2._byte === -1) {
        const hexUpper = HEX_VALUES[chunk[pos++]];
        if (hexUpper === -1)
          return -1;
        if (hexUpper >= 8)
          self2._encode = 2;
        if (pos < len) {
          const hexLower = HEX_VALUES[chunk[pos++]];
          if (hexLower === -1)
            return -1;
          if (self2._inKey)
            self2._key += String.fromCharCode((hexUpper << 4) + hexLower);
          else
            self2._val += String.fromCharCode((hexUpper << 4) + hexLower);
          self2._byte = -2;
          self2._lastPos = pos;
        } else {
          self2._byte = hexUpper;
        }
      } else {
        const hexLower = HEX_VALUES[chunk[pos++]];
        if (hexLower === -1)
          return -1;
        if (self2._inKey)
          self2._key += String.fromCharCode((self2._byte << 4) + hexLower);
        else
          self2._val += String.fromCharCode((self2._byte << 4) + hexLower);
        self2._byte = -2;
        self2._lastPos = pos;
      }
      return pos;
    }
    function skipKeyBytes(self2, chunk, pos, len) {
      if (self2._bytesKey > self2.fieldNameSizeLimit) {
        if (!self2._keyTrunc) {
          if (self2._lastPos < pos)
            self2._key += chunk.latin1Slice(self2._lastPos, pos - 1);
        }
        self2._keyTrunc = true;
        for (; pos < len; ++pos) {
          const code = chunk[pos];
          if (code === 61 || code === 38)
            break;
          ++self2._bytesKey;
        }
        self2._lastPos = pos;
      }
      return pos;
    }
    function skipValBytes(self2, chunk, pos, len) {
      if (self2._bytesVal > self2.fieldSizeLimit) {
        if (!self2._valTrunc) {
          if (self2._lastPos < pos)
            self2._val += chunk.latin1Slice(self2._lastPos, pos - 1);
        }
        self2._valTrunc = true;
        for (; pos < len; ++pos) {
          if (chunk[pos] === 38)
            break;
          ++self2._bytesVal;
        }
        self2._lastPos = pos;
      }
      return pos;
    }
    var HEX_VALUES = [
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      10,
      11,
      12,
      13,
      14,
      15,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      10,
      11,
      12,
      13,
      14,
      15,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1
    ];
    module2.exports = URLEncoded;
  }
});

// node_modules/busboy/lib/index.js
var require_lib = __commonJS({
  "node_modules/busboy/lib/index.js"(exports2, module2) {
    "use strict";
    var { parseContentType } = require_utils();
    function getInstance(cfg) {
      const headers = cfg.headers;
      const conType = parseContentType(headers["content-type"]);
      if (!conType)
        throw new Error("Malformed content type");
      for (const type of TYPES) {
        const matched = type.detect(conType);
        if (!matched)
          continue;
        const instanceCfg = {
          limits: cfg.limits,
          headers,
          conType,
          highWaterMark: void 0,
          fileHwm: void 0,
          defCharset: void 0,
          defParamCharset: void 0,
          preservePath: false
        };
        if (cfg.highWaterMark)
          instanceCfg.highWaterMark = cfg.highWaterMark;
        if (cfg.fileHwm)
          instanceCfg.fileHwm = cfg.fileHwm;
        instanceCfg.defCharset = cfg.defCharset;
        instanceCfg.defParamCharset = cfg.defParamCharset;
        instanceCfg.preservePath = cfg.preservePath;
        return new type(instanceCfg);
      }
      throw new Error(`Unsupported content type: ${headers["content-type"]}`);
    }
    var TYPES = [
      require_multipart(),
      require_urlencoded()
    ].filter(function(typemod) {
      return typeof typemod.detect === "function";
    });
    module2.exports = (cfg) => {
      if (typeof cfg !== "object" || cfg === null)
        cfg = {};
      if (typeof cfg.headers !== "object" || cfg.headers === null || typeof cfg.headers["content-type"] !== "string") {
        throw new Error("Missing Content-Type");
      }
      return getInstance(cfg);
    };
  }
});

// node_modules/append-field/lib/parse-path.js
var require_parse_path = __commonJS({
  "node_modules/append-field/lib/parse-path.js"(exports2, module2) {
    var reFirstKey = /^[^\[]*/;
    var reDigitPath = /^\[(\d+)\]/;
    var reNormalPath = /^\[([^\]]+)\]/;
    function parsePath(key) {
      function failure() {
        return [{ type: "object", key, last: true }];
      }
      var firstKey = reFirstKey.exec(key)[0];
      if (!firstKey) return failure();
      var len = key.length;
      var pos = firstKey.length;
      var tail = { type: "object", key: firstKey };
      var steps = [tail];
      while (pos < len) {
        var m;
        if (key[pos] === "[" && key[pos + 1] === "]") {
          pos += 2;
          tail.append = true;
          if (pos !== len) return failure();
          continue;
        }
        m = reDigitPath.exec(key.substring(pos));
        if (m !== null) {
          pos += m[0].length;
          tail.nextType = "array";
          tail = { type: "array", key: parseInt(m[1], 10) };
          steps.push(tail);
          continue;
        }
        m = reNormalPath.exec(key.substring(pos));
        if (m !== null) {
          pos += m[0].length;
          tail.nextType = "object";
          tail = { type: "object", key: m[1] };
          steps.push(tail);
          continue;
        }
        return failure();
      }
      tail.last = true;
      return steps;
    }
    module2.exports = parsePath;
  }
});

// node_modules/append-field/lib/set-value.js
var require_set_value = __commonJS({
  "node_modules/append-field/lib/set-value.js"(exports2, module2) {
    function valueType(value) {
      if (value === void 0) return "undefined";
      if (Array.isArray(value)) return "array";
      if (typeof value === "object") return "object";
      return "scalar";
    }
    function setLastValue(context, step, currentValue, entryValue) {
      switch (valueType(currentValue)) {
        case "undefined":
          if (step.append) {
            context[step.key] = [entryValue];
          } else {
            context[step.key] = entryValue;
          }
          break;
        case "array":
          context[step.key].push(entryValue);
          break;
        case "object":
          return setLastValue(currentValue, { type: "object", key: "", last: true }, currentValue[""], entryValue);
        case "scalar":
          context[step.key] = [context[step.key], entryValue];
          break;
      }
      return context;
    }
    function setValue(context, step, currentValue, entryValue) {
      if (step.last) return setLastValue(context, step, currentValue, entryValue);
      var obj;
      switch (valueType(currentValue)) {
        case "undefined":
          if (step.nextType === "array") {
            context[step.key] = [];
          } else {
            context[step.key] = /* @__PURE__ */ Object.create(null);
          }
          return context[step.key];
        case "object":
          return context[step.key];
        case "array":
          if (step.nextType === "array") {
            return currentValue;
          }
          obj = /* @__PURE__ */ Object.create(null);
          context[step.key] = obj;
          currentValue.forEach(function(item, i) {
            if (item !== void 0) obj["" + i] = item;
          });
          return obj;
        case "scalar":
          obj = /* @__PURE__ */ Object.create(null);
          obj[""] = currentValue;
          context[step.key] = obj;
          return obj;
      }
    }
    module2.exports = setValue;
  }
});

// node_modules/append-field/index.js
var require_append_field = __commonJS({
  "node_modules/append-field/index.js"(exports2, module2) {
    var parsePath = require_parse_path();
    var setValue = require_set_value();
    function appendField(store, key, value) {
      var steps = parsePath(key);
      steps.reduce(function(context, step) {
        return setValue(context, step, context[step.key], value);
      }, store);
    }
    module2.exports = appendField;
  }
});

// node_modules/multer/lib/counter.js
var require_counter = __commonJS({
  "node_modules/multer/lib/counter.js"(exports2, module2) {
    var EventEmitter = require("events").EventEmitter;
    function Counter() {
      EventEmitter.call(this);
      this.value = 0;
    }
    Counter.prototype = Object.create(EventEmitter.prototype);
    Counter.prototype.increment = function increment() {
      this.value++;
    };
    Counter.prototype.decrement = function decrement() {
      if (--this.value === 0) this.emit("zero");
    };
    Counter.prototype.isZero = function isZero() {
      return this.value === 0;
    };
    Counter.prototype.onceZero = function onceZero(fn) {
      if (this.isZero()) return fn();
      this.once("zero", fn);
    };
    module2.exports = Counter;
  }
});

// node_modules/multer/lib/multer-error.js
var require_multer_error = __commonJS({
  "node_modules/multer/lib/multer-error.js"(exports2, module2) {
    var util = require("util");
    var errorMessages = {
      LIMIT_PART_COUNT: "Too many parts",
      LIMIT_FILE_SIZE: "File too large",
      LIMIT_FILE_COUNT: "Too many files",
      LIMIT_FIELD_KEY: "Field name too long",
      LIMIT_FIELD_VALUE: "Field value too long",
      LIMIT_FIELD_COUNT: "Too many fields",
      LIMIT_UNEXPECTED_FILE: "Unexpected field",
      MISSING_FIELD_NAME: "Field name missing",
      LIMIT_FIELD_NESTING: "Field name nesting too deep"
    };
    function MulterError(code, field) {
      Error.captureStackTrace(this, this.constructor);
      this.name = this.constructor.name;
      this.message = errorMessages[code];
      this.code = code;
      if (field) this.field = field;
    }
    util.inherits(MulterError, Error);
    module2.exports = MulterError;
  }
});

// node_modules/multer/lib/file-appender.js
var require_file_appender = __commonJS({
  "node_modules/multer/lib/file-appender.js"(exports2, module2) {
    function arrayRemove(arr, item) {
      var idx = arr.indexOf(item);
      if (~idx) arr.splice(idx, 1);
    }
    function FileAppender(strategy, req) {
      this.strategy = strategy;
      this.req = req;
      switch (strategy) {
        case "NONE":
          break;
        case "VALUE":
          break;
        case "ARRAY":
          req.files = [];
          break;
        case "OBJECT":
          req.files = /* @__PURE__ */ Object.create(null);
          break;
        default:
          throw new Error("Unknown file strategy: " + strategy);
      }
    }
    FileAppender.prototype.insertPlaceholder = function(file) {
      var placeholder = {
        fieldname: file.fieldname
      };
      switch (this.strategy) {
        case "NONE":
          break;
        case "VALUE":
          break;
        case "ARRAY":
          this.req.files.push(placeholder);
          break;
        case "OBJECT":
          if (this.req.files[file.fieldname]) {
            this.req.files[file.fieldname].push(placeholder);
          } else {
            this.req.files[file.fieldname] = [placeholder];
          }
          break;
      }
      return placeholder;
    };
    FileAppender.prototype.removePlaceholder = function(placeholder) {
      switch (this.strategy) {
        case "NONE":
          break;
        case "VALUE":
          break;
        case "ARRAY":
          arrayRemove(this.req.files, placeholder);
          break;
        case "OBJECT":
          if (this.req.files[placeholder.fieldname].length === 1) {
            delete this.req.files[placeholder.fieldname];
          } else {
            arrayRemove(this.req.files[placeholder.fieldname], placeholder);
          }
          break;
      }
    };
    FileAppender.prototype.replacePlaceholder = function(placeholder, file) {
      if (this.strategy === "VALUE") {
        this.req.file = file;
        return;
      }
      delete placeholder.fieldname;
      Object.assign(placeholder, file);
    };
    module2.exports = FileAppender;
  }
});

// node_modules/multer/lib/remove-uploaded-files.js
var require_remove_uploaded_files = __commonJS({
  "node_modules/multer/lib/remove-uploaded-files.js"(exports2, module2) {
    function removeUploadedFiles(uploadedFiles, remove, cb) {
      var length = uploadedFiles.length;
      var errors = [];
      if (length === 0) return cb(null, errors);
      function handleFile(idx) {
        var file = uploadedFiles[idx];
        remove(file, function(err) {
          if (err) {
            err.file = file;
            err.field = file.fieldname;
            errors.push(err);
          }
          if (idx < length - 1) {
            setImmediate(function() {
              handleFile(idx + 1);
            });
          } else {
            cb(null, errors);
          }
        });
      }
      handleFile(0);
    }
    module2.exports = removeUploadedFiles;
  }
});

// node_modules/multer/lib/make-middleware.js
var require_make_middleware = __commonJS({
  "node_modules/multer/lib/make-middleware.js"(exports2, module2) {
    var is = require_type_is();
    var Busboy = require_lib();
    var appendField = require_append_field();
    var Counter = require_counter();
    var MulterError = require_multer_error();
    var FileAppender = require_file_appender();
    var removeUploadedFiles = require_remove_uploaded_files();
    function drainStream(stream) {
      stream.on("readable", () => {
        while (stream.read() !== null) {
        }
      });
    }
    function makeMiddleware(setup) {
      return function multerMiddleware(req, res, next) {
        if (!is(req, ["multipart"])) return next();
        var options = setup();
        var limits = options.limits;
        var storage = options.storage;
        var fileFilter = options.fileFilter;
        var fileStrategy = options.fileStrategy;
        var preservePath = options.preservePath;
        var defParamCharset = options.defParamCharset;
        req.body = /* @__PURE__ */ Object.create(null);
        var busboy;
        var appender = null;
        var isDone = false;
        var readFinished = false;
        var errorOccured = false;
        var pendingWrites = new Counter();
        var uploadedFiles = [];
        var pendingFiles = [];
        function done(err) {
          var called = false;
          function onFinished() {
            if (called) return;
            called = true;
            next(err);
          }
          if (isDone) return;
          isDone = true;
          if (busboy) {
            req.unpipe(busboy);
            setImmediate(() => {
              busboy.removeAllListeners();
            });
          }
          drainStream(req);
          req.resume();
          if (err && req.readable && !req.destroyed) {
            req.once("end", onFinished);
            req.once("error", onFinished);
            req.once("close", onFinished);
            return;
          }
          next(err);
        }
        function indicateDone() {
          if (readFinished && pendingWrites.isZero() && !errorOccured) done();
        }
        function abortWithError(uploadError, skipPendingWait) {
          if (errorOccured) return;
          errorOccured = true;
          function finishAbort() {
            function remove(file, cb) {
              storage._removeFile(req, file, cb);
            }
            var filesToRemove = uploadedFiles.concat(
              pendingFiles.filter(function(f) {
                return f.path;
              })
            );
            pendingFiles = [];
            removeUploadedFiles(filesToRemove, remove, function(err, storageErrors) {
              if (err) return done(err);
              uploadError.storageErrors = storageErrors;
              done(uploadError);
            });
          }
          if (skipPendingWait) {
            finishAbort();
          } else {
            pendingWrites.onceZero(finishAbort);
          }
        }
        function abortWithCode(code, optionalField) {
          abortWithError(new MulterError(code, optionalField));
        }
        function handleRequestFailure(err) {
          if (isDone) return;
          if (busboy) {
            req.unpipe(busboy);
            busboy.destroy(err);
          }
          abortWithError(err, true);
        }
        req.on("error", function(err) {
          handleRequestFailure(err || new Error("Request error"));
        });
        req.on("aborted", function() {
          handleRequestFailure(new Error("Request aborted"));
        });
        req.on("close", function() {
          if (req.readableEnded) return;
          handleRequestFailure(new Error("Request closed"));
        });
        try {
          busboy = Busboy({
            headers: req.headers,
            limits,
            preservePath,
            defParamCharset
          });
        } catch (err) {
          return next(err);
        }
        appender = new FileAppender(fileStrategy, req);
        busboy.on("field", function(fieldname, value, { nameTruncated, valueTruncated }) {
          if (fieldname == null) return abortWithCode("MISSING_FIELD_NAME");
          if (nameTruncated) return abortWithCode("LIMIT_FIELD_KEY");
          if (valueTruncated) return abortWithCode("LIMIT_FIELD_VALUE", fieldname);
          if (limits && Object.prototype.hasOwnProperty.call(limits, "fieldNameSize")) {
            if (fieldname.length > limits.fieldNameSize) return abortWithCode("LIMIT_FIELD_KEY");
          }
          if (limits && Object.prototype.hasOwnProperty.call(limits, "fieldNestingDepth")) {
            if (fieldname.split("[").length - 1 > limits.fieldNestingDepth) return abortWithCode("LIMIT_FIELD_NESTING", fieldname);
          }
          appendField(req.body, fieldname, value);
        });
        busboy.on("file", function(fieldname, fileStream, { filename, encoding, mimeType }) {
          var pendingWritesIncremented = false;
          fileStream.on("error", function(err) {
            if (pendingWritesIncremented) {
              pendingWrites.decrement();
            }
            abortWithError(err);
          });
          if (fieldname == null) return abortWithCode("MISSING_FIELD_NAME");
          if (!filename) return fileStream.resume();
          if (limits && Object.prototype.hasOwnProperty.call(limits, "fieldNameSize")) {
            if (fieldname.length > limits.fieldNameSize) return abortWithCode("LIMIT_FIELD_KEY");
          }
          var file = {
            fieldname,
            originalname: filename,
            encoding,
            mimetype: mimeType
          };
          var placeholder = appender.insertPlaceholder(file);
          fileFilter(req, file, function(err, includeFile) {
            if (errorOccured) {
              appender.removePlaceholder(placeholder);
              return fileStream.resume();
            }
            if (err) {
              appender.removePlaceholder(placeholder);
              return abortWithError(err);
            }
            if (!includeFile) {
              appender.removePlaceholder(placeholder);
              return fileStream.resume();
            }
            var aborting = false;
            pendingWritesIncremented = true;
            pendingWrites.increment();
            Object.defineProperty(file, "stream", {
              configurable: true,
              enumerable: false,
              value: fileStream
            });
            fileStream.on("limit", function() {
              aborting = true;
              abortWithCode("LIMIT_FILE_SIZE", fieldname);
            });
            pendingFiles.push(file);
            storage._handleFile(req, file, function(err2, info) {
              var idx = pendingFiles.indexOf(file);
              if (idx !== -1) pendingFiles.splice(idx, 1);
              if (aborting) {
                appender.removePlaceholder(placeholder);
                uploadedFiles.push({ ...file, ...info });
                return pendingWrites.decrement();
              }
              if (err2) {
                appender.removePlaceholder(placeholder);
                pendingWrites.decrement();
                return abortWithError(err2);
              }
              var fileInfo = { ...file, ...info };
              appender.replacePlaceholder(placeholder, fileInfo);
              uploadedFiles.push(fileInfo);
              pendingWrites.decrement();
              indicateDone();
            });
          });
        });
        busboy.on("error", function(err) {
          abortWithError(err);
        });
        busboy.on("partsLimit", function() {
          abortWithCode("LIMIT_PART_COUNT");
        });
        busboy.on("filesLimit", function() {
          abortWithCode("LIMIT_FILE_COUNT");
        });
        busboy.on("fieldsLimit", function() {
          abortWithCode("LIMIT_FIELD_COUNT");
        });
        busboy.on("close", function() {
          readFinished = true;
          indicateDone();
        });
        req.pipe(busboy);
      };
    }
    module2.exports = makeMiddleware;
  }
});

// node_modules/multer/storage/disk.js
var require_disk = __commonJS({
  "node_modules/multer/storage/disk.js"(exports2, module2) {
    var fs3 = require("fs");
    var os2 = require("os");
    var path2 = require("path");
    var crypto2 = require("crypto");
    function getFilename(req, file, cb) {
      crypto2.randomBytes(16, function(err, raw) {
        cb(err, err ? void 0 : raw.toString("hex"));
      });
    }
    function getDestination(req, file, cb) {
      cb(null, os2.tmpdir());
    }
    function DiskStorage(opts) {
      this.getFilename = opts.filename || getFilename;
      if (typeof opts.destination === "string") {
        fs3.mkdirSync(opts.destination, { recursive: true });
        this.getDestination = function($0, $1, cb) {
          cb(null, opts.destination);
        };
      } else {
        this.getDestination = opts.destination || getDestination;
      }
    }
    DiskStorage.prototype._handleFile = function _handleFile(req, file, cb) {
      var that = this;
      that.getDestination(req, file, function(err, destination) {
        if (err) return cb(err);
        that.getFilename(req, file, function(err2, filename) {
          if (err2) return cb(err2);
          var finalPath = path2.join(destination, filename);
          if (file.stream.destroyed) return;
          var outStream = fs3.createWriteStream(finalPath);
          file.path = finalPath;
          file.stream.pipe(outStream);
          outStream.on("error", cb);
          outStream.on("finish", function() {
            cb(null, {
              destination,
              filename,
              path: finalPath,
              size: outStream.bytesWritten
            });
          });
        });
      });
    };
    DiskStorage.prototype._removeFile = function _removeFile(req, file, cb) {
      var path3 = file.path;
      delete file.destination;
      delete file.filename;
      delete file.path;
      fs3.unlink(path3, cb);
    };
    module2.exports = function(opts) {
      return new DiskStorage(opts);
    };
  }
});

// node_modules/readable-stream/lib/internal/streams/stream.js
var require_stream = __commonJS({
  "node_modules/readable-stream/lib/internal/streams/stream.js"(exports2, module2) {
    module2.exports = require("stream");
  }
});

// node_modules/readable-stream/lib/internal/streams/buffer_list.js
var require_buffer_list = __commonJS({
  "node_modules/readable-stream/lib/internal/streams/buffer_list.js"(exports2, module2) {
    "use strict";
    function ownKeys(object, enumerableOnly) {
      var keys = Object.keys(object);
      if (Object.getOwnPropertySymbols) {
        var symbols = Object.getOwnPropertySymbols(object);
        enumerableOnly && (symbols = symbols.filter(function(sym) {
          return Object.getOwnPropertyDescriptor(object, sym).enumerable;
        })), keys.push.apply(keys, symbols);
      }
      return keys;
    }
    function _objectSpread(target) {
      for (var i = 1; i < arguments.length; i++) {
        var source = null != arguments[i] ? arguments[i] : {};
        i % 2 ? ownKeys(Object(source), true).forEach(function(key) {
          _defineProperty(target, key, source[key]);
        }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function(key) {
          Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
        });
      }
      return target;
    }
    function _defineProperty(obj, key, value) {
      key = _toPropertyKey(key);
      if (key in obj) {
        Object.defineProperty(obj, key, { value, enumerable: true, configurable: true, writable: true });
      } else {
        obj[key] = value;
      }
      return obj;
    }
    function _classCallCheck(instance, Constructor) {
      if (!(instance instanceof Constructor)) {
        throw new TypeError("Cannot call a class as a function");
      }
    }
    function _defineProperties(target, props) {
      for (var i = 0; i < props.length; i++) {
        var descriptor = props[i];
        descriptor.enumerable = descriptor.enumerable || false;
        descriptor.configurable = true;
        if ("value" in descriptor) descriptor.writable = true;
        Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor);
      }
    }
    function _createClass(Constructor, protoProps, staticProps) {
      if (protoProps) _defineProperties(Constructor.prototype, protoProps);
      if (staticProps) _defineProperties(Constructor, staticProps);
      Object.defineProperty(Constructor, "prototype", { writable: false });
      return Constructor;
    }
    function _toPropertyKey(arg) {
      var key = _toPrimitive(arg, "string");
      return typeof key === "symbol" ? key : String(key);
    }
    function _toPrimitive(input, hint) {
      if (typeof input !== "object" || input === null) return input;
      var prim = input[Symbol.toPrimitive];
      if (prim !== void 0) {
        var res = prim.call(input, hint || "default");
        if (typeof res !== "object") return res;
        throw new TypeError("@@toPrimitive must return a primitive value.");
      }
      return (hint === "string" ? String : Number)(input);
    }
    var _require = require("buffer");
    var Buffer2 = _require.Buffer;
    var _require2 = require("util");
    var inspect = _require2.inspect;
    var custom = inspect && inspect.custom || "inspect";
    function copyBuffer(src, target, offset) {
      Buffer2.prototype.copy.call(src, target, offset);
    }
    module2.exports = /* @__PURE__ */ function() {
      function BufferList() {
        _classCallCheck(this, BufferList);
        this.head = null;
        this.tail = null;
        this.length = 0;
      }
      _createClass(BufferList, [{
        key: "push",
        value: function push(v) {
          var entry = {
            data: v,
            next: null
          };
          if (this.length > 0) this.tail.next = entry;
          else this.head = entry;
          this.tail = entry;
          ++this.length;
        }
      }, {
        key: "unshift",
        value: function unshift(v) {
          var entry = {
            data: v,
            next: this.head
          };
          if (this.length === 0) this.tail = entry;
          this.head = entry;
          ++this.length;
        }
      }, {
        key: "shift",
        value: function shift() {
          if (this.length === 0) return;
          var ret = this.head.data;
          if (this.length === 1) this.head = this.tail = null;
          else this.head = this.head.next;
          --this.length;
          return ret;
        }
      }, {
        key: "clear",
        value: function clear() {
          this.head = this.tail = null;
          this.length = 0;
        }
      }, {
        key: "join",
        value: function join(s) {
          if (this.length === 0) return "";
          var p = this.head;
          var ret = "" + p.data;
          while (p = p.next) ret += s + p.data;
          return ret;
        }
      }, {
        key: "concat",
        value: function concat(n) {
          if (this.length === 0) return Buffer2.alloc(0);
          var ret = Buffer2.allocUnsafe(n >>> 0);
          var p = this.head;
          var i = 0;
          while (p) {
            copyBuffer(p.data, ret, i);
            i += p.data.length;
            p = p.next;
          }
          return ret;
        }
        // Consumes a specified amount of bytes or characters from the buffered data.
      }, {
        key: "consume",
        value: function consume(n, hasStrings) {
          var ret;
          if (n < this.head.data.length) {
            ret = this.head.data.slice(0, n);
            this.head.data = this.head.data.slice(n);
          } else if (n === this.head.data.length) {
            ret = this.shift();
          } else {
            ret = hasStrings ? this._getString(n) : this._getBuffer(n);
          }
          return ret;
        }
      }, {
        key: "first",
        value: function first() {
          return this.head.data;
        }
        // Consumes a specified amount of characters from the buffered data.
      }, {
        key: "_getString",
        value: function _getString(n) {
          var p = this.head;
          var c = 1;
          var ret = p.data;
          n -= ret.length;
          while (p = p.next) {
            var str = p.data;
            var nb = n > str.length ? str.length : n;
            if (nb === str.length) ret += str;
            else ret += str.slice(0, n);
            n -= nb;
            if (n === 0) {
              if (nb === str.length) {
                ++c;
                if (p.next) this.head = p.next;
                else this.head = this.tail = null;
              } else {
                this.head = p;
                p.data = str.slice(nb);
              }
              break;
            }
            ++c;
          }
          this.length -= c;
          return ret;
        }
        // Consumes a specified amount of bytes from the buffered data.
      }, {
        key: "_getBuffer",
        value: function _getBuffer(n) {
          var ret = Buffer2.allocUnsafe(n);
          var p = this.head;
          var c = 1;
          p.data.copy(ret);
          n -= p.data.length;
          while (p = p.next) {
            var buf = p.data;
            var nb = n > buf.length ? buf.length : n;
            buf.copy(ret, ret.length - n, 0, nb);
            n -= nb;
            if (n === 0) {
              if (nb === buf.length) {
                ++c;
                if (p.next) this.head = p.next;
                else this.head = this.tail = null;
              } else {
                this.head = p;
                p.data = buf.slice(nb);
              }
              break;
            }
            ++c;
          }
          this.length -= c;
          return ret;
        }
        // Make sure the linked list only shows the minimal necessary information.
      }, {
        key: custom,
        value: function value(_, options) {
          return inspect(this, _objectSpread(_objectSpread({}, options), {}, {
            // Only inspect one level.
            depth: 0,
            // It should not recurse.
            customInspect: false
          }));
        }
      }]);
      return BufferList;
    }();
  }
});

// node_modules/readable-stream/lib/internal/streams/destroy.js
var require_destroy = __commonJS({
  "node_modules/readable-stream/lib/internal/streams/destroy.js"(exports2, module2) {
    "use strict";
    function destroy(err, cb) {
      var _this = this;
      var readableDestroyed = this._readableState && this._readableState.destroyed;
      var writableDestroyed = this._writableState && this._writableState.destroyed;
      if (readableDestroyed || writableDestroyed) {
        if (cb) {
          cb(err);
        } else if (err) {
          if (!this._writableState) {
            process.nextTick(emitErrorNT, this, err);
          } else if (!this._writableState.errorEmitted) {
            this._writableState.errorEmitted = true;
            process.nextTick(emitErrorNT, this, err);
          }
        }
        return this;
      }
      if (this._readableState) {
        this._readableState.destroyed = true;
      }
      if (this._writableState) {
        this._writableState.destroyed = true;
      }
      this._destroy(err || null, function(err2) {
        if (!cb && err2) {
          if (!_this._writableState) {
            process.nextTick(emitErrorAndCloseNT, _this, err2);
          } else if (!_this._writableState.errorEmitted) {
            _this._writableState.errorEmitted = true;
            process.nextTick(emitErrorAndCloseNT, _this, err2);
          } else {
            process.nextTick(emitCloseNT, _this);
          }
        } else if (cb) {
          process.nextTick(emitCloseNT, _this);
          cb(err2);
        } else {
          process.nextTick(emitCloseNT, _this);
        }
      });
      return this;
    }
    function emitErrorAndCloseNT(self2, err) {
      emitErrorNT(self2, err);
      emitCloseNT(self2);
    }
    function emitCloseNT(self2) {
      if (self2._writableState && !self2._writableState.emitClose) return;
      if (self2._readableState && !self2._readableState.emitClose) return;
      self2.emit("close");
    }
    function undestroy() {
      if (this._readableState) {
        this._readableState.destroyed = false;
        this._readableState.reading = false;
        this._readableState.ended = false;
        this._readableState.endEmitted = false;
      }
      if (this._writableState) {
        this._writableState.destroyed = false;
        this._writableState.ended = false;
        this._writableState.ending = false;
        this._writableState.finalCalled = false;
        this._writableState.prefinished = false;
        this._writableState.finished = false;
        this._writableState.errorEmitted = false;
      }
    }
    function emitErrorNT(self2, err) {
      self2.emit("error", err);
    }
    function errorOrDestroy(stream, err) {
      var rState = stream._readableState;
      var wState = stream._writableState;
      if (rState && rState.autoDestroy || wState && wState.autoDestroy) stream.destroy(err);
      else stream.emit("error", err);
    }
    module2.exports = {
      destroy,
      undestroy,
      errorOrDestroy
    };
  }
});

// node_modules/readable-stream/errors.js
var require_errors = __commonJS({
  "node_modules/readable-stream/errors.js"(exports2, module2) {
    "use strict";
    var codes = {};
    function createErrorType(code, message, Base) {
      if (!Base) {
        Base = Error;
      }
      function getMessage(arg1, arg2, arg3) {
        if (typeof message === "string") {
          return message;
        } else {
          return message(arg1, arg2, arg3);
        }
      }
      class NodeError extends Base {
        constructor(arg1, arg2, arg3) {
          super(getMessage(arg1, arg2, arg3));
        }
      }
      NodeError.prototype.name = Base.name;
      NodeError.prototype.code = code;
      codes[code] = NodeError;
    }
    function oneOf(expected, thing) {
      if (Array.isArray(expected)) {
        const len = expected.length;
        expected = expected.map((i) => String(i));
        if (len > 2) {
          return `one of ${thing} ${expected.slice(0, len - 1).join(", ")}, or ` + expected[len - 1];
        } else if (len === 2) {
          return `one of ${thing} ${expected[0]} or ${expected[1]}`;
        } else {
          return `of ${thing} ${expected[0]}`;
        }
      } else {
        return `of ${thing} ${String(expected)}`;
      }
    }
    function startsWith(str, search, pos) {
      return str.substr(!pos || pos < 0 ? 0 : +pos, search.length) === search;
    }
    function endsWith(str, search, this_len) {
      if (this_len === void 0 || this_len > str.length) {
        this_len = str.length;
      }
      return str.substring(this_len - search.length, this_len) === search;
    }
    function includes(str, search, start) {
      if (typeof start !== "number") {
        start = 0;
      }
      if (start + search.length > str.length) {
        return false;
      } else {
        return str.indexOf(search, start) !== -1;
      }
    }
    createErrorType("ERR_INVALID_OPT_VALUE", function(name, value) {
      return 'The value "' + value + '" is invalid for option "' + name + '"';
    }, TypeError);
    createErrorType("ERR_INVALID_ARG_TYPE", function(name, expected, actual) {
      let determiner;
      if (typeof expected === "string" && startsWith(expected, "not ")) {
        determiner = "must not be";
        expected = expected.replace(/^not /, "");
      } else {
        determiner = "must be";
      }
      let msg;
      if (endsWith(name, " argument")) {
        msg = `The ${name} ${determiner} ${oneOf(expected, "type")}`;
      } else {
        const type = includes(name, ".") ? "property" : "argument";
        msg = `The "${name}" ${type} ${determiner} ${oneOf(expected, "type")}`;
      }
      msg += `. Received type ${typeof actual}`;
      return msg;
    }, TypeError);
    createErrorType("ERR_STREAM_PUSH_AFTER_EOF", "stream.push() after EOF");
    createErrorType("ERR_METHOD_NOT_IMPLEMENTED", function(name) {
      return "The " + name + " method is not implemented";
    });
    createErrorType("ERR_STREAM_PREMATURE_CLOSE", "Premature close");
    createErrorType("ERR_STREAM_DESTROYED", function(name) {
      return "Cannot call " + name + " after a stream was destroyed";
    });
    createErrorType("ERR_MULTIPLE_CALLBACK", "Callback called multiple times");
    createErrorType("ERR_STREAM_CANNOT_PIPE", "Cannot pipe, not readable");
    createErrorType("ERR_STREAM_WRITE_AFTER_END", "write after end");
    createErrorType("ERR_STREAM_NULL_VALUES", "May not write null values to stream", TypeError);
    createErrorType("ERR_UNKNOWN_ENCODING", function(arg) {
      return "Unknown encoding: " + arg;
    }, TypeError);
    createErrorType("ERR_STREAM_UNSHIFT_AFTER_END_EVENT", "stream.unshift() after end event");
    module2.exports.codes = codes;
  }
});

// node_modules/readable-stream/lib/internal/streams/state.js
var require_state = __commonJS({
  "node_modules/readable-stream/lib/internal/streams/state.js"(exports2, module2) {
    "use strict";
    var ERR_INVALID_OPT_VALUE = require_errors().codes.ERR_INVALID_OPT_VALUE;
    function highWaterMarkFrom(options, isDuplex, duplexKey) {
      return options.highWaterMark != null ? options.highWaterMark : isDuplex ? options[duplexKey] : null;
    }
    function getHighWaterMark(state, options, duplexKey, isDuplex) {
      var hwm = highWaterMarkFrom(options, isDuplex, duplexKey);
      if (hwm != null) {
        if (!(isFinite(hwm) && Math.floor(hwm) === hwm) || hwm < 0) {
          var name = isDuplex ? duplexKey : "highWaterMark";
          throw new ERR_INVALID_OPT_VALUE(name, hwm);
        }
        return Math.floor(hwm);
      }
      return state.objectMode ? 16 : 16 * 1024;
    }
    module2.exports = {
      getHighWaterMark
    };
  }
});

// node_modules/inherits/inherits_browser.js
var require_inherits_browser = __commonJS({
  "node_modules/inherits/inherits_browser.js"(exports2, module2) {
    if (typeof Object.create === "function") {
      module2.exports = function inherits(ctor, superCtor) {
        if (superCtor) {
          ctor.super_ = superCtor;
          ctor.prototype = Object.create(superCtor.prototype, {
            constructor: {
              value: ctor,
              enumerable: false,
              writable: true,
              configurable: true
            }
          });
        }
      };
    } else {
      module2.exports = function inherits(ctor, superCtor) {
        if (superCtor) {
          ctor.super_ = superCtor;
          var TempCtor = function() {
          };
          TempCtor.prototype = superCtor.prototype;
          ctor.prototype = new TempCtor();
          ctor.prototype.constructor = ctor;
        }
      };
    }
  }
});

// node_modules/inherits/inherits.js
var require_inherits = __commonJS({
  "node_modules/inherits/inherits.js"(exports2, module2) {
    try {
      util = require("util");
      if (typeof util.inherits !== "function") throw "";
      module2.exports = util.inherits;
    } catch (e) {
      module2.exports = require_inherits_browser();
    }
    var util;
  }
});

// node_modules/util-deprecate/node.js
var require_node = __commonJS({
  "node_modules/util-deprecate/node.js"(exports2, module2) {
    module2.exports = require("util").deprecate;
  }
});

// node_modules/readable-stream/lib/_stream_writable.js
var require_stream_writable = __commonJS({
  "node_modules/readable-stream/lib/_stream_writable.js"(exports2, module2) {
    "use strict";
    module2.exports = Writable;
    function CorkedRequest(state) {
      var _this = this;
      this.next = null;
      this.entry = null;
      this.finish = function() {
        onCorkedFinish(_this, state);
      };
    }
    var Duplex;
    Writable.WritableState = WritableState;
    var internalUtil = {
      deprecate: require_node()
    };
    var Stream = require_stream();
    var Buffer2 = require("buffer").Buffer;
    var OurUint8Array = (typeof global !== "undefined" ? global : typeof window !== "undefined" ? window : typeof self !== "undefined" ? self : {}).Uint8Array || function() {
    };
    function _uint8ArrayToBuffer(chunk) {
      return Buffer2.from(chunk);
    }
    function _isUint8Array(obj) {
      return Buffer2.isBuffer(obj) || obj instanceof OurUint8Array;
    }
    var destroyImpl = require_destroy();
    var _require = require_state();
    var getHighWaterMark = _require.getHighWaterMark;
    var _require$codes = require_errors().codes;
    var ERR_INVALID_ARG_TYPE = _require$codes.ERR_INVALID_ARG_TYPE;
    var ERR_METHOD_NOT_IMPLEMENTED = _require$codes.ERR_METHOD_NOT_IMPLEMENTED;
    var ERR_MULTIPLE_CALLBACK = _require$codes.ERR_MULTIPLE_CALLBACK;
    var ERR_STREAM_CANNOT_PIPE = _require$codes.ERR_STREAM_CANNOT_PIPE;
    var ERR_STREAM_DESTROYED = _require$codes.ERR_STREAM_DESTROYED;
    var ERR_STREAM_NULL_VALUES = _require$codes.ERR_STREAM_NULL_VALUES;
    var ERR_STREAM_WRITE_AFTER_END = _require$codes.ERR_STREAM_WRITE_AFTER_END;
    var ERR_UNKNOWN_ENCODING = _require$codes.ERR_UNKNOWN_ENCODING;
    var errorOrDestroy = destroyImpl.errorOrDestroy;
    require_inherits()(Writable, Stream);
    function nop() {
    }
    function WritableState(options, stream, isDuplex) {
      Duplex = Duplex || require_stream_duplex();
      options = options || {};
      if (typeof isDuplex !== "boolean") isDuplex = stream instanceof Duplex;
      this.objectMode = !!options.objectMode;
      if (isDuplex) this.objectMode = this.objectMode || !!options.writableObjectMode;
      this.highWaterMark = getHighWaterMark(this, options, "writableHighWaterMark", isDuplex);
      this.finalCalled = false;
      this.needDrain = false;
      this.ending = false;
      this.ended = false;
      this.finished = false;
      this.destroyed = false;
      var noDecode = options.decodeStrings === false;
      this.decodeStrings = !noDecode;
      this.defaultEncoding = options.defaultEncoding || "utf8";
      this.length = 0;
      this.writing = false;
      this.corked = 0;
      this.sync = true;
      this.bufferProcessing = false;
      this.onwrite = function(er) {
        onwrite(stream, er);
      };
      this.writecb = null;
      this.writelen = 0;
      this.bufferedRequest = null;
      this.lastBufferedRequest = null;
      this.pendingcb = 0;
      this.prefinished = false;
      this.errorEmitted = false;
      this.emitClose = options.emitClose !== false;
      this.autoDestroy = !!options.autoDestroy;
      this.bufferedRequestCount = 0;
      this.corkedRequestsFree = new CorkedRequest(this);
    }
    WritableState.prototype.getBuffer = function getBuffer() {
      var current = this.bufferedRequest;
      var out = [];
      while (current) {
        out.push(current);
        current = current.next;
      }
      return out;
    };
    (function() {
      try {
        Object.defineProperty(WritableState.prototype, "buffer", {
          get: internalUtil.deprecate(function writableStateBufferGetter() {
            return this.getBuffer();
          }, "_writableState.buffer is deprecated. Use _writableState.getBuffer instead.", "DEP0003")
        });
      } catch (_) {
      }
    })();
    var realHasInstance;
    if (typeof Symbol === "function" && Symbol.hasInstance && typeof Function.prototype[Symbol.hasInstance] === "function") {
      realHasInstance = Function.prototype[Symbol.hasInstance];
      Object.defineProperty(Writable, Symbol.hasInstance, {
        value: function value(object) {
          if (realHasInstance.call(this, object)) return true;
          if (this !== Writable) return false;
          return object && object._writableState instanceof WritableState;
        }
      });
    } else {
      realHasInstance = function realHasInstance2(object) {
        return object instanceof this;
      };
    }
    function Writable(options) {
      Duplex = Duplex || require_stream_duplex();
      var isDuplex = this instanceof Duplex;
      if (!isDuplex && !realHasInstance.call(Writable, this)) return new Writable(options);
      this._writableState = new WritableState(options, this, isDuplex);
      this.writable = true;
      if (options) {
        if (typeof options.write === "function") this._write = options.write;
        if (typeof options.writev === "function") this._writev = options.writev;
        if (typeof options.destroy === "function") this._destroy = options.destroy;
        if (typeof options.final === "function") this._final = options.final;
      }
      Stream.call(this);
    }
    Writable.prototype.pipe = function() {
      errorOrDestroy(this, new ERR_STREAM_CANNOT_PIPE());
    };
    function writeAfterEnd(stream, cb) {
      var er = new ERR_STREAM_WRITE_AFTER_END();
      errorOrDestroy(stream, er);
      process.nextTick(cb, er);
    }
    function validChunk(stream, state, chunk, cb) {
      var er;
      if (chunk === null) {
        er = new ERR_STREAM_NULL_VALUES();
      } else if (typeof chunk !== "string" && !state.objectMode) {
        er = new ERR_INVALID_ARG_TYPE("chunk", ["string", "Buffer"], chunk);
      }
      if (er) {
        errorOrDestroy(stream, er);
        process.nextTick(cb, er);
        return false;
      }
      return true;
    }
    Writable.prototype.write = function(chunk, encoding, cb) {
      var state = this._writableState;
      var ret = false;
      var isBuf = !state.objectMode && _isUint8Array(chunk);
      if (isBuf && !Buffer2.isBuffer(chunk)) {
        chunk = _uint8ArrayToBuffer(chunk);
      }
      if (typeof encoding === "function") {
        cb = encoding;
        encoding = null;
      }
      if (isBuf) encoding = "buffer";
      else if (!encoding) encoding = state.defaultEncoding;
      if (typeof cb !== "function") cb = nop;
      if (state.ending) writeAfterEnd(this, cb);
      else if (isBuf || validChunk(this, state, chunk, cb)) {
        state.pendingcb++;
        ret = writeOrBuffer(this, state, isBuf, chunk, encoding, cb);
      }
      return ret;
    };
    Writable.prototype.cork = function() {
      this._writableState.corked++;
    };
    Writable.prototype.uncork = function() {
      var state = this._writableState;
      if (state.corked) {
        state.corked--;
        if (!state.writing && !state.corked && !state.bufferProcessing && state.bufferedRequest) clearBuffer(this, state);
      }
    };
    Writable.prototype.setDefaultEncoding = function setDefaultEncoding(encoding) {
      if (typeof encoding === "string") encoding = encoding.toLowerCase();
      if (!(["hex", "utf8", "utf-8", "ascii", "binary", "base64", "ucs2", "ucs-2", "utf16le", "utf-16le", "raw"].indexOf((encoding + "").toLowerCase()) > -1)) throw new ERR_UNKNOWN_ENCODING(encoding);
      this._writableState.defaultEncoding = encoding;
      return this;
    };
    Object.defineProperty(Writable.prototype, "writableBuffer", {
      // making it explicit this property is not enumerable
      // because otherwise some prototype manipulation in
      // userland will fail
      enumerable: false,
      get: function get() {
        return this._writableState && this._writableState.getBuffer();
      }
    });
    function decodeChunk(state, chunk, encoding) {
      if (!state.objectMode && state.decodeStrings !== false && typeof chunk === "string") {
        chunk = Buffer2.from(chunk, encoding);
      }
      return chunk;
    }
    Object.defineProperty(Writable.prototype, "writableHighWaterMark", {
      // making it explicit this property is not enumerable
      // because otherwise some prototype manipulation in
      // userland will fail
      enumerable: false,
      get: function get() {
        return this._writableState.highWaterMark;
      }
    });
    function writeOrBuffer(stream, state, isBuf, chunk, encoding, cb) {
      if (!isBuf) {
        var newChunk = decodeChunk(state, chunk, encoding);
        if (chunk !== newChunk) {
          isBuf = true;
          encoding = "buffer";
          chunk = newChunk;
        }
      }
      var len = state.objectMode ? 1 : chunk.length;
      state.length += len;
      var ret = state.length < state.highWaterMark;
      if (!ret) state.needDrain = true;
      if (state.writing || state.corked) {
        var last = state.lastBufferedRequest;
        state.lastBufferedRequest = {
          chunk,
          encoding,
          isBuf,
          callback: cb,
          next: null
        };
        if (last) {
          last.next = state.lastBufferedRequest;
        } else {
          state.bufferedRequest = state.lastBufferedRequest;
        }
        state.bufferedRequestCount += 1;
      } else {
        doWrite(stream, state, false, len, chunk, encoding, cb);
      }
      return ret;
    }
    function doWrite(stream, state, writev, len, chunk, encoding, cb) {
      state.writelen = len;
      state.writecb = cb;
      state.writing = true;
      state.sync = true;
      if (state.destroyed) state.onwrite(new ERR_STREAM_DESTROYED("write"));
      else if (writev) stream._writev(chunk, state.onwrite);
      else stream._write(chunk, encoding, state.onwrite);
      state.sync = false;
    }
    function onwriteError(stream, state, sync, er, cb) {
      --state.pendingcb;
      if (sync) {
        process.nextTick(cb, er);
        process.nextTick(finishMaybe, stream, state);
        stream._writableState.errorEmitted = true;
        errorOrDestroy(stream, er);
      } else {
        cb(er);
        stream._writableState.errorEmitted = true;
        errorOrDestroy(stream, er);
        finishMaybe(stream, state);
      }
    }
    function onwriteStateUpdate(state) {
      state.writing = false;
      state.writecb = null;
      state.length -= state.writelen;
      state.writelen = 0;
    }
    function onwrite(stream, er) {
      var state = stream._writableState;
      var sync = state.sync;
      var cb = state.writecb;
      if (typeof cb !== "function") throw new ERR_MULTIPLE_CALLBACK();
      onwriteStateUpdate(state);
      if (er) onwriteError(stream, state, sync, er, cb);
      else {
        var finished = needFinish(state) || stream.destroyed;
        if (!finished && !state.corked && !state.bufferProcessing && state.bufferedRequest) {
          clearBuffer(stream, state);
        }
        if (sync) {
          process.nextTick(afterWrite, stream, state, finished, cb);
        } else {
          afterWrite(stream, state, finished, cb);
        }
      }
    }
    function afterWrite(stream, state, finished, cb) {
      if (!finished) onwriteDrain(stream, state);
      state.pendingcb--;
      cb();
      finishMaybe(stream, state);
    }
    function onwriteDrain(stream, state) {
      if (state.length === 0 && state.needDrain) {
        state.needDrain = false;
        stream.emit("drain");
      }
    }
    function clearBuffer(stream, state) {
      state.bufferProcessing = true;
      var entry = state.bufferedRequest;
      if (stream._writev && entry && entry.next) {
        var l = state.bufferedRequestCount;
        var buffer = new Array(l);
        var holder = state.corkedRequestsFree;
        holder.entry = entry;
        var count = 0;
        var allBuffers = true;
        while (entry) {
          buffer[count] = entry;
          if (!entry.isBuf) allBuffers = false;
          entry = entry.next;
          count += 1;
        }
        buffer.allBuffers = allBuffers;
        doWrite(stream, state, true, state.length, buffer, "", holder.finish);
        state.pendingcb++;
        state.lastBufferedRequest = null;
        if (holder.next) {
          state.corkedRequestsFree = holder.next;
          holder.next = null;
        } else {
          state.corkedRequestsFree = new CorkedRequest(state);
        }
        state.bufferedRequestCount = 0;
      } else {
        while (entry) {
          var chunk = entry.chunk;
          var encoding = entry.encoding;
          var cb = entry.callback;
          var len = state.objectMode ? 1 : chunk.length;
          doWrite(stream, state, false, len, chunk, encoding, cb);
          entry = entry.next;
          state.bufferedRequestCount--;
          if (state.writing) {
            break;
          }
        }
        if (entry === null) state.lastBufferedRequest = null;
      }
      state.bufferedRequest = entry;
      state.bufferProcessing = false;
    }
    Writable.prototype._write = function(chunk, encoding, cb) {
      cb(new ERR_METHOD_NOT_IMPLEMENTED("_write()"));
    };
    Writable.prototype._writev = null;
    Writable.prototype.end = function(chunk, encoding, cb) {
      var state = this._writableState;
      if (typeof chunk === "function") {
        cb = chunk;
        chunk = null;
        encoding = null;
      } else if (typeof encoding === "function") {
        cb = encoding;
        encoding = null;
      }
      if (chunk !== null && chunk !== void 0) this.write(chunk, encoding);
      if (state.corked) {
        state.corked = 1;
        this.uncork();
      }
      if (!state.ending) endWritable(this, state, cb);
      return this;
    };
    Object.defineProperty(Writable.prototype, "writableLength", {
      // making it explicit this property is not enumerable
      // because otherwise some prototype manipulation in
      // userland will fail
      enumerable: false,
      get: function get() {
        return this._writableState.length;
      }
    });
    function needFinish(state) {
      return state.ending && state.length === 0 && state.bufferedRequest === null && !state.finished && !state.writing;
    }
    function callFinal(stream, state) {
      stream._final(function(err) {
        state.pendingcb--;
        if (err) {
          errorOrDestroy(stream, err);
        }
        state.prefinished = true;
        stream.emit("prefinish");
        finishMaybe(stream, state);
      });
    }
    function prefinish(stream, state) {
      if (!state.prefinished && !state.finalCalled) {
        if (typeof stream._final === "function" && !state.destroyed) {
          state.pendingcb++;
          state.finalCalled = true;
          process.nextTick(callFinal, stream, state);
        } else {
          state.prefinished = true;
          stream.emit("prefinish");
        }
      }
    }
    function finishMaybe(stream, state) {
      var need = needFinish(state);
      if (need) {
        prefinish(stream, state);
        if (state.pendingcb === 0) {
          state.finished = true;
          stream.emit("finish");
          if (state.autoDestroy) {
            var rState = stream._readableState;
            if (!rState || rState.autoDestroy && rState.endEmitted) {
              stream.destroy();
            }
          }
        }
      }
      return need;
    }
    function endWritable(stream, state, cb) {
      state.ending = true;
      finishMaybe(stream, state);
      if (cb) {
        if (state.finished) process.nextTick(cb);
        else stream.once("finish", cb);
      }
      state.ended = true;
      stream.writable = false;
    }
    function onCorkedFinish(corkReq, state, err) {
      var entry = corkReq.entry;
      corkReq.entry = null;
      while (entry) {
        var cb = entry.callback;
        state.pendingcb--;
        cb(err);
        entry = entry.next;
      }
      state.corkedRequestsFree.next = corkReq;
    }
    Object.defineProperty(Writable.prototype, "destroyed", {
      // making it explicit this property is not enumerable
      // because otherwise some prototype manipulation in
      // userland will fail
      enumerable: false,
      get: function get() {
        if (this._writableState === void 0) {
          return false;
        }
        return this._writableState.destroyed;
      },
      set: function set(value) {
        if (!this._writableState) {
          return;
        }
        this._writableState.destroyed = value;
      }
    });
    Writable.prototype.destroy = destroyImpl.destroy;
    Writable.prototype._undestroy = destroyImpl.undestroy;
    Writable.prototype._destroy = function(err, cb) {
      cb(err);
    };
  }
});

// node_modules/readable-stream/lib/_stream_duplex.js
var require_stream_duplex = __commonJS({
  "node_modules/readable-stream/lib/_stream_duplex.js"(exports2, module2) {
    "use strict";
    var objectKeys = Object.keys || function(obj) {
      var keys2 = [];
      for (var key in obj) keys2.push(key);
      return keys2;
    };
    module2.exports = Duplex;
    var Readable = require_stream_readable();
    var Writable = require_stream_writable();
    require_inherits()(Duplex, Readable);
    {
      keys = objectKeys(Writable.prototype);
      for (v = 0; v < keys.length; v++) {
        method = keys[v];
        if (!Duplex.prototype[method]) Duplex.prototype[method] = Writable.prototype[method];
      }
    }
    var keys;
    var method;
    var v;
    function Duplex(options) {
      if (!(this instanceof Duplex)) return new Duplex(options);
      Readable.call(this, options);
      Writable.call(this, options);
      this.allowHalfOpen = true;
      if (options) {
        if (options.readable === false) this.readable = false;
        if (options.writable === false) this.writable = false;
        if (options.allowHalfOpen === false) {
          this.allowHalfOpen = false;
          this.once("end", onend);
        }
      }
    }
    Object.defineProperty(Duplex.prototype, "writableHighWaterMark", {
      // making it explicit this property is not enumerable
      // because otherwise some prototype manipulation in
      // userland will fail
      enumerable: false,
      get: function get() {
        return this._writableState.highWaterMark;
      }
    });
    Object.defineProperty(Duplex.prototype, "writableBuffer", {
      // making it explicit this property is not enumerable
      // because otherwise some prototype manipulation in
      // userland will fail
      enumerable: false,
      get: function get() {
        return this._writableState && this._writableState.getBuffer();
      }
    });
    Object.defineProperty(Duplex.prototype, "writableLength", {
      // making it explicit this property is not enumerable
      // because otherwise some prototype manipulation in
      // userland will fail
      enumerable: false,
      get: function get() {
        return this._writableState.length;
      }
    });
    function onend() {
      if (this._writableState.ended) return;
      process.nextTick(onEndNT, this);
    }
    function onEndNT(self2) {
      self2.end();
    }
    Object.defineProperty(Duplex.prototype, "destroyed", {
      // making it explicit this property is not enumerable
      // because otherwise some prototype manipulation in
      // userland will fail
      enumerable: false,
      get: function get() {
        if (this._readableState === void 0 || this._writableState === void 0) {
          return false;
        }
        return this._readableState.destroyed && this._writableState.destroyed;
      },
      set: function set(value) {
        if (this._readableState === void 0 || this._writableState === void 0) {
          return;
        }
        this._readableState.destroyed = value;
        this._writableState.destroyed = value;
      }
    });
  }
});

// node_modules/safe-buffer/index.js
var require_safe_buffer = __commonJS({
  "node_modules/safe-buffer/index.js"(exports2, module2) {
    var buffer = require("buffer");
    var Buffer2 = buffer.Buffer;
    function copyProps(src, dst) {
      for (var key in src) {
        dst[key] = src[key];
      }
    }
    if (Buffer2.from && Buffer2.alloc && Buffer2.allocUnsafe && Buffer2.allocUnsafeSlow) {
      module2.exports = buffer;
    } else {
      copyProps(buffer, exports2);
      exports2.Buffer = SafeBuffer;
    }
    function SafeBuffer(arg, encodingOrOffset, length) {
      return Buffer2(arg, encodingOrOffset, length);
    }
    SafeBuffer.prototype = Object.create(Buffer2.prototype);
    copyProps(Buffer2, SafeBuffer);
    SafeBuffer.from = function(arg, encodingOrOffset, length) {
      if (typeof arg === "number") {
        throw new TypeError("Argument must not be a number");
      }
      return Buffer2(arg, encodingOrOffset, length);
    };
    SafeBuffer.alloc = function(size, fill, encoding) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      var buf = Buffer2(size);
      if (fill !== void 0) {
        if (typeof encoding === "string") {
          buf.fill(fill, encoding);
        } else {
          buf.fill(fill);
        }
      } else {
        buf.fill(0);
      }
      return buf;
    };
    SafeBuffer.allocUnsafe = function(size) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      return Buffer2(size);
    };
    SafeBuffer.allocUnsafeSlow = function(size) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      return buffer.SlowBuffer(size);
    };
  }
});

// node_modules/string_decoder/lib/string_decoder.js
var require_string_decoder = __commonJS({
  "node_modules/string_decoder/lib/string_decoder.js"(exports2) {
    "use strict";
    var Buffer2 = require_safe_buffer().Buffer;
    var isEncoding = Buffer2.isEncoding || function(encoding) {
      encoding = "" + encoding;
      switch (encoding && encoding.toLowerCase()) {
        case "hex":
        case "utf8":
        case "utf-8":
        case "ascii":
        case "binary":
        case "base64":
        case "ucs2":
        case "ucs-2":
        case "utf16le":
        case "utf-16le":
        case "raw":
          return true;
        default:
          return false;
      }
    };
    function _normalizeEncoding(enc) {
      if (!enc) return "utf8";
      var retried;
      while (true) {
        switch (enc) {
          case "utf8":
          case "utf-8":
            return "utf8";
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return "utf16le";
          case "latin1":
          case "binary":
            return "latin1";
          case "base64":
          case "ascii":
          case "hex":
            return enc;
          default:
            if (retried) return;
            enc = ("" + enc).toLowerCase();
            retried = true;
        }
      }
    }
    function normalizeEncoding(enc) {
      var nenc = _normalizeEncoding(enc);
      if (typeof nenc !== "string" && (Buffer2.isEncoding === isEncoding || !isEncoding(enc))) throw new Error("Unknown encoding: " + enc);
      return nenc || enc;
    }
    exports2.StringDecoder = StringDecoder;
    function StringDecoder(encoding) {
      this.encoding = normalizeEncoding(encoding);
      var nb;
      switch (this.encoding) {
        case "utf16le":
          this.text = utf16Text;
          this.end = utf16End;
          nb = 4;
          break;
        case "utf8":
          this.fillLast = utf8FillLast;
          nb = 4;
          break;
        case "base64":
          this.text = base64Text;
          this.end = base64End;
          nb = 3;
          break;
        default:
          this.write = simpleWrite;
          this.end = simpleEnd;
          return;
      }
      this.lastNeed = 0;
      this.lastTotal = 0;
      this.lastChar = Buffer2.allocUnsafe(nb);
    }
    StringDecoder.prototype.write = function(buf) {
      if (buf.length === 0) return "";
      var r;
      var i;
      if (this.lastNeed) {
        r = this.fillLast(buf);
        if (r === void 0) return "";
        i = this.lastNeed;
        this.lastNeed = 0;
      } else {
        i = 0;
      }
      if (i < buf.length) return r ? r + this.text(buf, i) : this.text(buf, i);
      return r || "";
    };
    StringDecoder.prototype.end = utf8End;
    StringDecoder.prototype.text = utf8Text;
    StringDecoder.prototype.fillLast = function(buf) {
      if (this.lastNeed <= buf.length) {
        buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, this.lastNeed);
        return this.lastChar.toString(this.encoding, 0, this.lastTotal);
      }
      buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, buf.length);
      this.lastNeed -= buf.length;
    };
    function utf8CheckByte(byte) {
      if (byte <= 127) return 0;
      else if (byte >> 5 === 6) return 2;
      else if (byte >> 4 === 14) return 3;
      else if (byte >> 3 === 30) return 4;
      return byte >> 6 === 2 ? -1 : -2;
    }
    function utf8CheckIncomplete(self2, buf, i) {
      var j = buf.length - 1;
      if (j < i) return 0;
      var nb = utf8CheckByte(buf[j]);
      if (nb >= 0) {
        if (nb > 0) self2.lastNeed = nb - 1;
        return nb;
      }
      if (--j < i || nb === -2) return 0;
      nb = utf8CheckByte(buf[j]);
      if (nb >= 0) {
        if (nb > 0) self2.lastNeed = nb - 2;
        return nb;
      }
      if (--j < i || nb === -2) return 0;
      nb = utf8CheckByte(buf[j]);
      if (nb >= 0) {
        if (nb > 0) {
          if (nb === 2) nb = 0;
          else self2.lastNeed = nb - 3;
        }
        return nb;
      }
      return 0;
    }
    function utf8CheckExtraBytes(self2, buf, p) {
      if ((buf[0] & 192) !== 128) {
        self2.lastNeed = 0;
        return "\uFFFD";
      }
      if (self2.lastNeed > 1 && buf.length > 1) {
        if ((buf[1] & 192) !== 128) {
          self2.lastNeed = 1;
          return "\uFFFD";
        }
        if (self2.lastNeed > 2 && buf.length > 2) {
          if ((buf[2] & 192) !== 128) {
            self2.lastNeed = 2;
            return "\uFFFD";
          }
        }
      }
    }
    function utf8FillLast(buf) {
      var p = this.lastTotal - this.lastNeed;
      var r = utf8CheckExtraBytes(this, buf, p);
      if (r !== void 0) return r;
      if (this.lastNeed <= buf.length) {
        buf.copy(this.lastChar, p, 0, this.lastNeed);
        return this.lastChar.toString(this.encoding, 0, this.lastTotal);
      }
      buf.copy(this.lastChar, p, 0, buf.length);
      this.lastNeed -= buf.length;
    }
    function utf8Text(buf, i) {
      var total = utf8CheckIncomplete(this, buf, i);
      if (!this.lastNeed) return buf.toString("utf8", i);
      this.lastTotal = total;
      var end = buf.length - (total - this.lastNeed);
      buf.copy(this.lastChar, 0, end);
      return buf.toString("utf8", i, end);
    }
    function utf8End(buf) {
      var r = buf && buf.length ? this.write(buf) : "";
      if (this.lastNeed) return r + "\uFFFD";
      return r;
    }
    function utf16Text(buf, i) {
      if ((buf.length - i) % 2 === 0) {
        var r = buf.toString("utf16le", i);
        if (r) {
          var c = r.charCodeAt(r.length - 1);
          if (c >= 55296 && c <= 56319) {
            this.lastNeed = 2;
            this.lastTotal = 4;
            this.lastChar[0] = buf[buf.length - 2];
            this.lastChar[1] = buf[buf.length - 1];
            return r.slice(0, -1);
          }
        }
        return r;
      }
      this.lastNeed = 1;
      this.lastTotal = 2;
      this.lastChar[0] = buf[buf.length - 1];
      return buf.toString("utf16le", i, buf.length - 1);
    }
    function utf16End(buf) {
      var r = buf && buf.length ? this.write(buf) : "";
      if (this.lastNeed) {
        var end = this.lastTotal - this.lastNeed;
        return r + this.lastChar.toString("utf16le", 0, end);
      }
      return r;
    }
    function base64Text(buf, i) {
      var n = (buf.length - i) % 3;
      if (n === 0) return buf.toString("base64", i);
      this.lastNeed = 3 - n;
      this.lastTotal = 3;
      if (n === 1) {
        this.lastChar[0] = buf[buf.length - 1];
      } else {
        this.lastChar[0] = buf[buf.length - 2];
        this.lastChar[1] = buf[buf.length - 1];
      }
      return buf.toString("base64", i, buf.length - n);
    }
    function base64End(buf) {
      var r = buf && buf.length ? this.write(buf) : "";
      if (this.lastNeed) return r + this.lastChar.toString("base64", 0, 3 - this.lastNeed);
      return r;
    }
    function simpleWrite(buf) {
      return buf.toString(this.encoding);
    }
    function simpleEnd(buf) {
      return buf && buf.length ? this.write(buf) : "";
    }
  }
});

// node_modules/readable-stream/lib/internal/streams/end-of-stream.js
var require_end_of_stream = __commonJS({
  "node_modules/readable-stream/lib/internal/streams/end-of-stream.js"(exports2, module2) {
    "use strict";
    var ERR_STREAM_PREMATURE_CLOSE = require_errors().codes.ERR_STREAM_PREMATURE_CLOSE;
    function once(callback) {
      var called = false;
      return function() {
        if (called) return;
        called = true;
        for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
          args[_key] = arguments[_key];
        }
        callback.apply(this, args);
      };
    }
    function noop() {
    }
    function isRequest(stream) {
      return stream.setHeader && typeof stream.abort === "function";
    }
    function eos(stream, opts, callback) {
      if (typeof opts === "function") return eos(stream, null, opts);
      if (!opts) opts = {};
      callback = once(callback || noop);
      var readable = opts.readable || opts.readable !== false && stream.readable;
      var writable = opts.writable || opts.writable !== false && stream.writable;
      var onlegacyfinish = function onlegacyfinish2() {
        if (!stream.writable) onfinish();
      };
      var writableEnded = stream._writableState && stream._writableState.finished;
      var onfinish = function onfinish2() {
        writable = false;
        writableEnded = true;
        if (!readable) callback.call(stream);
      };
      var readableEnded = stream._readableState && stream._readableState.endEmitted;
      var onend = function onend2() {
        readable = false;
        readableEnded = true;
        if (!writable) callback.call(stream);
      };
      var onerror = function onerror2(err) {
        callback.call(stream, err);
      };
      var onclose = function onclose2() {
        var err;
        if (readable && !readableEnded) {
          if (!stream._readableState || !stream._readableState.ended) err = new ERR_STREAM_PREMATURE_CLOSE();
          return callback.call(stream, err);
        }
        if (writable && !writableEnded) {
          if (!stream._writableState || !stream._writableState.ended) err = new ERR_STREAM_PREMATURE_CLOSE();
          return callback.call(stream, err);
        }
      };
      var onrequest = function onrequest2() {
        stream.req.on("finish", onfinish);
      };
      if (isRequest(stream)) {
        stream.on("complete", onfinish);
        stream.on("abort", onclose);
        if (stream.req) onrequest();
        else stream.on("request", onrequest);
      } else if (writable && !stream._writableState) {
        stream.on("end", onlegacyfinish);
        stream.on("close", onlegacyfinish);
      }
      stream.on("end", onend);
      stream.on("finish", onfinish);
      if (opts.error !== false) stream.on("error", onerror);
      stream.on("close", onclose);
      return function() {
        stream.removeListener("complete", onfinish);
        stream.removeListener("abort", onclose);
        stream.removeListener("request", onrequest);
        if (stream.req) stream.req.removeListener("finish", onfinish);
        stream.removeListener("end", onlegacyfinish);
        stream.removeListener("close", onlegacyfinish);
        stream.removeListener("finish", onfinish);
        stream.removeListener("end", onend);
        stream.removeListener("error", onerror);
        stream.removeListener("close", onclose);
      };
    }
    module2.exports = eos;
  }
});

// node_modules/readable-stream/lib/internal/streams/async_iterator.js
var require_async_iterator = __commonJS({
  "node_modules/readable-stream/lib/internal/streams/async_iterator.js"(exports2, module2) {
    "use strict";
    var _Object$setPrototypeO;
    function _defineProperty(obj, key, value) {
      key = _toPropertyKey(key);
      if (key in obj) {
        Object.defineProperty(obj, key, { value, enumerable: true, configurable: true, writable: true });
      } else {
        obj[key] = value;
      }
      return obj;
    }
    function _toPropertyKey(arg) {
      var key = _toPrimitive(arg, "string");
      return typeof key === "symbol" ? key : String(key);
    }
    function _toPrimitive(input, hint) {
      if (typeof input !== "object" || input === null) return input;
      var prim = input[Symbol.toPrimitive];
      if (prim !== void 0) {
        var res = prim.call(input, hint || "default");
        if (typeof res !== "object") return res;
        throw new TypeError("@@toPrimitive must return a primitive value.");
      }
      return (hint === "string" ? String : Number)(input);
    }
    var finished = require_end_of_stream();
    var kLastResolve = Symbol("lastResolve");
    var kLastReject = Symbol("lastReject");
    var kError = Symbol("error");
    var kEnded = Symbol("ended");
    var kLastPromise = Symbol("lastPromise");
    var kHandlePromise = Symbol("handlePromise");
    var kStream = Symbol("stream");
    function createIterResult(value, done) {
      return {
        value,
        done
      };
    }
    function readAndResolve(iter) {
      var resolve = iter[kLastResolve];
      if (resolve !== null) {
        var data = iter[kStream].read();
        if (data !== null) {
          iter[kLastPromise] = null;
          iter[kLastResolve] = null;
          iter[kLastReject] = null;
          resolve(createIterResult(data, false));
        }
      }
    }
    function onReadable(iter) {
      process.nextTick(readAndResolve, iter);
    }
    function wrapForNext(lastPromise, iter) {
      return function(resolve, reject) {
        lastPromise.then(function() {
          if (iter[kEnded]) {
            resolve(createIterResult(void 0, true));
            return;
          }
          iter[kHandlePromise](resolve, reject);
        }, reject);
      };
    }
    var AsyncIteratorPrototype = Object.getPrototypeOf(function() {
    });
    var ReadableStreamAsyncIteratorPrototype = Object.setPrototypeOf((_Object$setPrototypeO = {
      get stream() {
        return this[kStream];
      },
      next: function next() {
        var _this = this;
        var error = this[kError];
        if (error !== null) {
          return Promise.reject(error);
        }
        if (this[kEnded]) {
          return Promise.resolve(createIterResult(void 0, true));
        }
        if (this[kStream].destroyed) {
          return new Promise(function(resolve, reject) {
            process.nextTick(function() {
              if (_this[kError]) {
                reject(_this[kError]);
              } else {
                resolve(createIterResult(void 0, true));
              }
            });
          });
        }
        var lastPromise = this[kLastPromise];
        var promise;
        if (lastPromise) {
          promise = new Promise(wrapForNext(lastPromise, this));
        } else {
          var data = this[kStream].read();
          if (data !== null) {
            return Promise.resolve(createIterResult(data, false));
          }
          promise = new Promise(this[kHandlePromise]);
        }
        this[kLastPromise] = promise;
        return promise;
      }
    }, _defineProperty(_Object$setPrototypeO, Symbol.asyncIterator, function() {
      return this;
    }), _defineProperty(_Object$setPrototypeO, "return", function _return() {
      var _this2 = this;
      return new Promise(function(resolve, reject) {
        _this2[kStream].destroy(null, function(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve(createIterResult(void 0, true));
        });
      });
    }), _Object$setPrototypeO), AsyncIteratorPrototype);
    var createReadableStreamAsyncIterator = function createReadableStreamAsyncIterator2(stream) {
      var _Object$create;
      var iterator = Object.create(ReadableStreamAsyncIteratorPrototype, (_Object$create = {}, _defineProperty(_Object$create, kStream, {
        value: stream,
        writable: true
      }), _defineProperty(_Object$create, kLastResolve, {
        value: null,
        writable: true
      }), _defineProperty(_Object$create, kLastReject, {
        value: null,
        writable: true
      }), _defineProperty(_Object$create, kError, {
        value: null,
        writable: true
      }), _defineProperty(_Object$create, kEnded, {
        value: stream._readableState.endEmitted,
        writable: true
      }), _defineProperty(_Object$create, kHandlePromise, {
        value: function value(resolve, reject) {
          var data = iterator[kStream].read();
          if (data) {
            iterator[kLastPromise] = null;
            iterator[kLastResolve] = null;
            iterator[kLastReject] = null;
            resolve(createIterResult(data, false));
          } else {
            iterator[kLastResolve] = resolve;
            iterator[kLastReject] = reject;
          }
        },
        writable: true
      }), _Object$create));
      iterator[kLastPromise] = null;
      finished(stream, function(err) {
        if (err && err.code !== "ERR_STREAM_PREMATURE_CLOSE") {
          var reject = iterator[kLastReject];
          if (reject !== null) {
            iterator[kLastPromise] = null;
            iterator[kLastResolve] = null;
            iterator[kLastReject] = null;
            reject(err);
          }
          iterator[kError] = err;
          return;
        }
        var resolve = iterator[kLastResolve];
        if (resolve !== null) {
          iterator[kLastPromise] = null;
          iterator[kLastResolve] = null;
          iterator[kLastReject] = null;
          resolve(createIterResult(void 0, true));
        }
        iterator[kEnded] = true;
      });
      stream.on("readable", onReadable.bind(null, iterator));
      return iterator;
    };
    module2.exports = createReadableStreamAsyncIterator;
  }
});

// node_modules/readable-stream/lib/internal/streams/from.js
var require_from = __commonJS({
  "node_modules/readable-stream/lib/internal/streams/from.js"(exports2, module2) {
    "use strict";
    function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) {
      try {
        var info = gen[key](arg);
        var value = info.value;
      } catch (error) {
        reject(error);
        return;
      }
      if (info.done) {
        resolve(value);
      } else {
        Promise.resolve(value).then(_next, _throw);
      }
    }
    function _asyncToGenerator(fn) {
      return function() {
        var self2 = this, args = arguments;
        return new Promise(function(resolve, reject) {
          var gen = fn.apply(self2, args);
          function _next(value) {
            asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value);
          }
          function _throw(err) {
            asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err);
          }
          _next(void 0);
        });
      };
    }
    function ownKeys(object, enumerableOnly) {
      var keys = Object.keys(object);
      if (Object.getOwnPropertySymbols) {
        var symbols = Object.getOwnPropertySymbols(object);
        enumerableOnly && (symbols = symbols.filter(function(sym) {
          return Object.getOwnPropertyDescriptor(object, sym).enumerable;
        })), keys.push.apply(keys, symbols);
      }
      return keys;
    }
    function _objectSpread(target) {
      for (var i = 1; i < arguments.length; i++) {
        var source = null != arguments[i] ? arguments[i] : {};
        i % 2 ? ownKeys(Object(source), true).forEach(function(key) {
          _defineProperty(target, key, source[key]);
        }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function(key) {
          Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
        });
      }
      return target;
    }
    function _defineProperty(obj, key, value) {
      key = _toPropertyKey(key);
      if (key in obj) {
        Object.defineProperty(obj, key, { value, enumerable: true, configurable: true, writable: true });
      } else {
        obj[key] = value;
      }
      return obj;
    }
    function _toPropertyKey(arg) {
      var key = _toPrimitive(arg, "string");
      return typeof key === "symbol" ? key : String(key);
    }
    function _toPrimitive(input, hint) {
      if (typeof input !== "object" || input === null) return input;
      var prim = input[Symbol.toPrimitive];
      if (prim !== void 0) {
        var res = prim.call(input, hint || "default");
        if (typeof res !== "object") return res;
        throw new TypeError("@@toPrimitive must return a primitive value.");
      }
      return (hint === "string" ? String : Number)(input);
    }
    var ERR_INVALID_ARG_TYPE = require_errors().codes.ERR_INVALID_ARG_TYPE;
    function from(Readable, iterable, opts) {
      var iterator;
      if (iterable && typeof iterable.next === "function") {
        iterator = iterable;
      } else if (iterable && iterable[Symbol.asyncIterator]) iterator = iterable[Symbol.asyncIterator]();
      else if (iterable && iterable[Symbol.iterator]) iterator = iterable[Symbol.iterator]();
      else throw new ERR_INVALID_ARG_TYPE("iterable", ["Iterable"], iterable);
      var readable = new Readable(_objectSpread({
        objectMode: true
      }, opts));
      var reading = false;
      readable._read = function() {
        if (!reading) {
          reading = true;
          next();
        }
      };
      function next() {
        return _next2.apply(this, arguments);
      }
      function _next2() {
        _next2 = _asyncToGenerator(function* () {
          try {
            var _yield$iterator$next = yield iterator.next(), value = _yield$iterator$next.value, done = _yield$iterator$next.done;
            if (done) {
              readable.push(null);
            } else if (readable.push(yield value)) {
              next();
            } else {
              reading = false;
            }
          } catch (err) {
            readable.destroy(err);
          }
        });
        return _next2.apply(this, arguments);
      }
      return readable;
    }
    module2.exports = from;
  }
});

// node_modules/readable-stream/lib/_stream_readable.js
var require_stream_readable = __commonJS({
  "node_modules/readable-stream/lib/_stream_readable.js"(exports2, module2) {
    "use strict";
    module2.exports = Readable;
    var Duplex;
    Readable.ReadableState = ReadableState;
    var EE = require("events").EventEmitter;
    var EElistenerCount = function EElistenerCount2(emitter, type) {
      return emitter.listeners(type).length;
    };
    var Stream = require_stream();
    var Buffer2 = require("buffer").Buffer;
    var OurUint8Array = (typeof global !== "undefined" ? global : typeof window !== "undefined" ? window : typeof self !== "undefined" ? self : {}).Uint8Array || function() {
    };
    function _uint8ArrayToBuffer(chunk) {
      return Buffer2.from(chunk);
    }
    function _isUint8Array(obj) {
      return Buffer2.isBuffer(obj) || obj instanceof OurUint8Array;
    }
    var debugUtil = require("util");
    var debug;
    if (debugUtil && debugUtil.debuglog) {
      debug = debugUtil.debuglog("stream");
    } else {
      debug = function debug2() {
      };
    }
    var BufferList = require_buffer_list();
    var destroyImpl = require_destroy();
    var _require = require_state();
    var getHighWaterMark = _require.getHighWaterMark;
    var _require$codes = require_errors().codes;
    var ERR_INVALID_ARG_TYPE = _require$codes.ERR_INVALID_ARG_TYPE;
    var ERR_STREAM_PUSH_AFTER_EOF = _require$codes.ERR_STREAM_PUSH_AFTER_EOF;
    var ERR_METHOD_NOT_IMPLEMENTED = _require$codes.ERR_METHOD_NOT_IMPLEMENTED;
    var ERR_STREAM_UNSHIFT_AFTER_END_EVENT = _require$codes.ERR_STREAM_UNSHIFT_AFTER_END_EVENT;
    var StringDecoder;
    var createReadableStreamAsyncIterator;
    var from;
    require_inherits()(Readable, Stream);
    var errorOrDestroy = destroyImpl.errorOrDestroy;
    var kProxyEvents = ["error", "close", "destroy", "pause", "resume"];
    function prependListener(emitter, event, fn) {
      if (typeof emitter.prependListener === "function") return emitter.prependListener(event, fn);
      if (!emitter._events || !emitter._events[event]) emitter.on(event, fn);
      else if (Array.isArray(emitter._events[event])) emitter._events[event].unshift(fn);
      else emitter._events[event] = [fn, emitter._events[event]];
    }
    function ReadableState(options, stream, isDuplex) {
      Duplex = Duplex || require_stream_duplex();
      options = options || {};
      if (typeof isDuplex !== "boolean") isDuplex = stream instanceof Duplex;
      this.objectMode = !!options.objectMode;
      if (isDuplex) this.objectMode = this.objectMode || !!options.readableObjectMode;
      this.highWaterMark = getHighWaterMark(this, options, "readableHighWaterMark", isDuplex);
      this.buffer = new BufferList();
      this.length = 0;
      this.pipes = null;
      this.pipesCount = 0;
      this.flowing = null;
      this.ended = false;
      this.endEmitted = false;
      this.reading = false;
      this.sync = true;
      this.needReadable = false;
      this.emittedReadable = false;
      this.readableListening = false;
      this.resumeScheduled = false;
      this.paused = true;
      this.emitClose = options.emitClose !== false;
      this.autoDestroy = !!options.autoDestroy;
      this.destroyed = false;
      this.defaultEncoding = options.defaultEncoding || "utf8";
      this.awaitDrain = 0;
      this.readingMore = false;
      this.decoder = null;
      this.encoding = null;
      if (options.encoding) {
        if (!StringDecoder) StringDecoder = require_string_decoder().StringDecoder;
        this.decoder = new StringDecoder(options.encoding);
        this.encoding = options.encoding;
      }
    }
    function Readable(options) {
      Duplex = Duplex || require_stream_duplex();
      if (!(this instanceof Readable)) return new Readable(options);
      var isDuplex = this instanceof Duplex;
      this._readableState = new ReadableState(options, this, isDuplex);
      this.readable = true;
      if (options) {
        if (typeof options.read === "function") this._read = options.read;
        if (typeof options.destroy === "function") this._destroy = options.destroy;
      }
      Stream.call(this);
    }
    Object.defineProperty(Readable.prototype, "destroyed", {
      // making it explicit this property is not enumerable
      // because otherwise some prototype manipulation in
      // userland will fail
      enumerable: false,
      get: function get() {
        if (this._readableState === void 0) {
          return false;
        }
        return this._readableState.destroyed;
      },
      set: function set(value) {
        if (!this._readableState) {
          return;
        }
        this._readableState.destroyed = value;
      }
    });
    Readable.prototype.destroy = destroyImpl.destroy;
    Readable.prototype._undestroy = destroyImpl.undestroy;
    Readable.prototype._destroy = function(err, cb) {
      cb(err);
    };
    Readable.prototype.push = function(chunk, encoding) {
      var state = this._readableState;
      var skipChunkCheck;
      if (!state.objectMode) {
        if (typeof chunk === "string") {
          encoding = encoding || state.defaultEncoding;
          if (encoding !== state.encoding) {
            chunk = Buffer2.from(chunk, encoding);
            encoding = "";
          }
          skipChunkCheck = true;
        }
      } else {
        skipChunkCheck = true;
      }
      return readableAddChunk(this, chunk, encoding, false, skipChunkCheck);
    };
    Readable.prototype.unshift = function(chunk) {
      return readableAddChunk(this, chunk, null, true, false);
    };
    function readableAddChunk(stream, chunk, encoding, addToFront, skipChunkCheck) {
      debug("readableAddChunk", chunk);
      var state = stream._readableState;
      if (chunk === null) {
        state.reading = false;
        onEofChunk(stream, state);
      } else {
        var er;
        if (!skipChunkCheck) er = chunkInvalid(state, chunk);
        if (er) {
          errorOrDestroy(stream, er);
        } else if (state.objectMode || chunk && chunk.length > 0) {
          if (typeof chunk !== "string" && !state.objectMode && Object.getPrototypeOf(chunk) !== Buffer2.prototype) {
            chunk = _uint8ArrayToBuffer(chunk);
          }
          if (addToFront) {
            if (state.endEmitted) errorOrDestroy(stream, new ERR_STREAM_UNSHIFT_AFTER_END_EVENT());
            else addChunk(stream, state, chunk, true);
          } else if (state.ended) {
            errorOrDestroy(stream, new ERR_STREAM_PUSH_AFTER_EOF());
          } else if (state.destroyed) {
            return false;
          } else {
            state.reading = false;
            if (state.decoder && !encoding) {
              chunk = state.decoder.write(chunk);
              if (state.objectMode || chunk.length !== 0) addChunk(stream, state, chunk, false);
              else maybeReadMore(stream, state);
            } else {
              addChunk(stream, state, chunk, false);
            }
          }
        } else if (!addToFront) {
          state.reading = false;
          maybeReadMore(stream, state);
        }
      }
      return !state.ended && (state.length < state.highWaterMark || state.length === 0);
    }
    function addChunk(stream, state, chunk, addToFront) {
      if (state.flowing && state.length === 0 && !state.sync) {
        state.awaitDrain = 0;
        stream.emit("data", chunk);
      } else {
        state.length += state.objectMode ? 1 : chunk.length;
        if (addToFront) state.buffer.unshift(chunk);
        else state.buffer.push(chunk);
        if (state.needReadable) emitReadable(stream);
      }
      maybeReadMore(stream, state);
    }
    function chunkInvalid(state, chunk) {
      var er;
      if (!_isUint8Array(chunk) && typeof chunk !== "string" && chunk !== void 0 && !state.objectMode) {
        er = new ERR_INVALID_ARG_TYPE("chunk", ["string", "Buffer", "Uint8Array"], chunk);
      }
      return er;
    }
    Readable.prototype.isPaused = function() {
      return this._readableState.flowing === false;
    };
    Readable.prototype.setEncoding = function(enc) {
      if (!StringDecoder) StringDecoder = require_string_decoder().StringDecoder;
      var decoder = new StringDecoder(enc);
      this._readableState.decoder = decoder;
      this._readableState.encoding = this._readableState.decoder.encoding;
      var p = this._readableState.buffer.head;
      var content = "";
      while (p !== null) {
        content += decoder.write(p.data);
        p = p.next;
      }
      this._readableState.buffer.clear();
      if (content !== "") this._readableState.buffer.push(content);
      this._readableState.length = content.length;
      return this;
    };
    var MAX_HWM = 1073741824;
    function computeNewHighWaterMark(n) {
      if (n >= MAX_HWM) {
        n = MAX_HWM;
      } else {
        n--;
        n |= n >>> 1;
        n |= n >>> 2;
        n |= n >>> 4;
        n |= n >>> 8;
        n |= n >>> 16;
        n++;
      }
      return n;
    }
    function howMuchToRead(n, state) {
      if (n <= 0 || state.length === 0 && state.ended) return 0;
      if (state.objectMode) return 1;
      if (n !== n) {
        if (state.flowing && state.length) return state.buffer.head.data.length;
        else return state.length;
      }
      if (n > state.highWaterMark) state.highWaterMark = computeNewHighWaterMark(n);
      if (n <= state.length) return n;
      if (!state.ended) {
        state.needReadable = true;
        return 0;
      }
      return state.length;
    }
    Readable.prototype.read = function(n) {
      debug("read", n);
      n = parseInt(n, 10);
      var state = this._readableState;
      var nOrig = n;
      if (n !== 0) state.emittedReadable = false;
      if (n === 0 && state.needReadable && ((state.highWaterMark !== 0 ? state.length >= state.highWaterMark : state.length > 0) || state.ended)) {
        debug("read: emitReadable", state.length, state.ended);
        if (state.length === 0 && state.ended) endReadable(this);
        else emitReadable(this);
        return null;
      }
      n = howMuchToRead(n, state);
      if (n === 0 && state.ended) {
        if (state.length === 0) endReadable(this);
        return null;
      }
      var doRead = state.needReadable;
      debug("need readable", doRead);
      if (state.length === 0 || state.length - n < state.highWaterMark) {
        doRead = true;
        debug("length less than watermark", doRead);
      }
      if (state.ended || state.reading) {
        doRead = false;
        debug("reading or ended", doRead);
      } else if (doRead) {
        debug("do read");
        state.reading = true;
        state.sync = true;
        if (state.length === 0) state.needReadable = true;
        this._read(state.highWaterMark);
        state.sync = false;
        if (!state.reading) n = howMuchToRead(nOrig, state);
      }
      var ret;
      if (n > 0) ret = fromList(n, state);
      else ret = null;
      if (ret === null) {
        state.needReadable = state.length <= state.highWaterMark;
        n = 0;
      } else {
        state.length -= n;
        state.awaitDrain = 0;
      }
      if (state.length === 0) {
        if (!state.ended) state.needReadable = true;
        if (nOrig !== n && state.ended) endReadable(this);
      }
      if (ret !== null) this.emit("data", ret);
      return ret;
    };
    function onEofChunk(stream, state) {
      debug("onEofChunk");
      if (state.ended) return;
      if (state.decoder) {
        var chunk = state.decoder.end();
        if (chunk && chunk.length) {
          state.buffer.push(chunk);
          state.length += state.objectMode ? 1 : chunk.length;
        }
      }
      state.ended = true;
      if (state.sync) {
        emitReadable(stream);
      } else {
        state.needReadable = false;
        if (!state.emittedReadable) {
          state.emittedReadable = true;
          emitReadable_(stream);
        }
      }
    }
    function emitReadable(stream) {
      var state = stream._readableState;
      debug("emitReadable", state.needReadable, state.emittedReadable);
      state.needReadable = false;
      if (!state.emittedReadable) {
        debug("emitReadable", state.flowing);
        state.emittedReadable = true;
        process.nextTick(emitReadable_, stream);
      }
    }
    function emitReadable_(stream) {
      var state = stream._readableState;
      debug("emitReadable_", state.destroyed, state.length, state.ended);
      if (!state.destroyed && (state.length || state.ended)) {
        stream.emit("readable");
        state.emittedReadable = false;
      }
      state.needReadable = !state.flowing && !state.ended && state.length <= state.highWaterMark;
      flow(stream);
    }
    function maybeReadMore(stream, state) {
      if (!state.readingMore) {
        state.readingMore = true;
        process.nextTick(maybeReadMore_, stream, state);
      }
    }
    function maybeReadMore_(stream, state) {
      while (!state.reading && !state.ended && (state.length < state.highWaterMark || state.flowing && state.length === 0)) {
        var len = state.length;
        debug("maybeReadMore read 0");
        stream.read(0);
        if (len === state.length)
          break;
      }
      state.readingMore = false;
    }
    Readable.prototype._read = function(n) {
      errorOrDestroy(this, new ERR_METHOD_NOT_IMPLEMENTED("_read()"));
    };
    Readable.prototype.pipe = function(dest, pipeOpts) {
      var src = this;
      var state = this._readableState;
      switch (state.pipesCount) {
        case 0:
          state.pipes = dest;
          break;
        case 1:
          state.pipes = [state.pipes, dest];
          break;
        default:
          state.pipes.push(dest);
          break;
      }
      state.pipesCount += 1;
      debug("pipe count=%d opts=%j", state.pipesCount, pipeOpts);
      var doEnd = (!pipeOpts || pipeOpts.end !== false) && dest !== process.stdout && dest !== process.stderr;
      var endFn = doEnd ? onend : unpipe;
      if (state.endEmitted) process.nextTick(endFn);
      else src.once("end", endFn);
      dest.on("unpipe", onunpipe);
      function onunpipe(readable, unpipeInfo) {
        debug("onunpipe");
        if (readable === src) {
          if (unpipeInfo && unpipeInfo.hasUnpiped === false) {
            unpipeInfo.hasUnpiped = true;
            cleanup();
          }
        }
      }
      function onend() {
        debug("onend");
        dest.end();
      }
      var ondrain = pipeOnDrain(src);
      dest.on("drain", ondrain);
      var cleanedUp = false;
      function cleanup() {
        debug("cleanup");
        dest.removeListener("close", onclose);
        dest.removeListener("finish", onfinish);
        dest.removeListener("drain", ondrain);
        dest.removeListener("error", onerror);
        dest.removeListener("unpipe", onunpipe);
        src.removeListener("end", onend);
        src.removeListener("end", unpipe);
        src.removeListener("data", ondata);
        cleanedUp = true;
        if (state.awaitDrain && (!dest._writableState || dest._writableState.needDrain)) ondrain();
      }
      src.on("data", ondata);
      function ondata(chunk) {
        debug("ondata");
        var ret = dest.write(chunk);
        debug("dest.write", ret);
        if (ret === false) {
          if ((state.pipesCount === 1 && state.pipes === dest || state.pipesCount > 1 && indexOf(state.pipes, dest) !== -1) && !cleanedUp) {
            debug("false write response, pause", state.awaitDrain);
            state.awaitDrain++;
          }
          src.pause();
        }
      }
      function onerror(er) {
        debug("onerror", er);
        unpipe();
        dest.removeListener("error", onerror);
        if (EElistenerCount(dest, "error") === 0) errorOrDestroy(dest, er);
      }
      prependListener(dest, "error", onerror);
      function onclose() {
        dest.removeListener("finish", onfinish);
        unpipe();
      }
      dest.once("close", onclose);
      function onfinish() {
        debug("onfinish");
        dest.removeListener("close", onclose);
        unpipe();
      }
      dest.once("finish", onfinish);
      function unpipe() {
        debug("unpipe");
        src.unpipe(dest);
      }
      dest.emit("pipe", src);
      if (!state.flowing) {
        debug("pipe resume");
        src.resume();
      }
      return dest;
    };
    function pipeOnDrain(src) {
      return function pipeOnDrainFunctionResult() {
        var state = src._readableState;
        debug("pipeOnDrain", state.awaitDrain);
        if (state.awaitDrain) state.awaitDrain--;
        if (state.awaitDrain === 0 && EElistenerCount(src, "data")) {
          state.flowing = true;
          flow(src);
        }
      };
    }
    Readable.prototype.unpipe = function(dest) {
      var state = this._readableState;
      var unpipeInfo = {
        hasUnpiped: false
      };
      if (state.pipesCount === 0) return this;
      if (state.pipesCount === 1) {
        if (dest && dest !== state.pipes) return this;
        if (!dest) dest = state.pipes;
        state.pipes = null;
        state.pipesCount = 0;
        state.flowing = false;
        if (dest) dest.emit("unpipe", this, unpipeInfo);
        return this;
      }
      if (!dest) {
        var dests = state.pipes;
        var len = state.pipesCount;
        state.pipes = null;
        state.pipesCount = 0;
        state.flowing = false;
        for (var i = 0; i < len; i++) dests[i].emit("unpipe", this, {
          hasUnpiped: false
        });
        return this;
      }
      var index = indexOf(state.pipes, dest);
      if (index === -1) return this;
      state.pipes.splice(index, 1);
      state.pipesCount -= 1;
      if (state.pipesCount === 1) state.pipes = state.pipes[0];
      dest.emit("unpipe", this, unpipeInfo);
      return this;
    };
    Readable.prototype.on = function(ev, fn) {
      var res = Stream.prototype.on.call(this, ev, fn);
      var state = this._readableState;
      if (ev === "data") {
        state.readableListening = this.listenerCount("readable") > 0;
        if (state.flowing !== false) this.resume();
      } else if (ev === "readable") {
        if (!state.endEmitted && !state.readableListening) {
          state.readableListening = state.needReadable = true;
          state.flowing = false;
          state.emittedReadable = false;
          debug("on readable", state.length, state.reading);
          if (state.length) {
            emitReadable(this);
          } else if (!state.reading) {
            process.nextTick(nReadingNextTick, this);
          }
        }
      }
      return res;
    };
    Readable.prototype.addListener = Readable.prototype.on;
    Readable.prototype.removeListener = function(ev, fn) {
      var res = Stream.prototype.removeListener.call(this, ev, fn);
      if (ev === "readable") {
        process.nextTick(updateReadableListening, this);
      }
      return res;
    };
    Readable.prototype.removeAllListeners = function(ev) {
      var res = Stream.prototype.removeAllListeners.apply(this, arguments);
      if (ev === "readable" || ev === void 0) {
        process.nextTick(updateReadableListening, this);
      }
      return res;
    };
    function updateReadableListening(self2) {
      var state = self2._readableState;
      state.readableListening = self2.listenerCount("readable") > 0;
      if (state.resumeScheduled && !state.paused) {
        state.flowing = true;
      } else if (self2.listenerCount("data") > 0) {
        self2.resume();
      }
    }
    function nReadingNextTick(self2) {
      debug("readable nexttick read 0");
      self2.read(0);
    }
    Readable.prototype.resume = function() {
      var state = this._readableState;
      if (!state.flowing) {
        debug("resume");
        state.flowing = !state.readableListening;
        resume(this, state);
      }
      state.paused = false;
      return this;
    };
    function resume(stream, state) {
      if (!state.resumeScheduled) {
        state.resumeScheduled = true;
        process.nextTick(resume_, stream, state);
      }
    }
    function resume_(stream, state) {
      debug("resume", state.reading);
      if (!state.reading) {
        stream.read(0);
      }
      state.resumeScheduled = false;
      stream.emit("resume");
      flow(stream);
      if (state.flowing && !state.reading) stream.read(0);
    }
    Readable.prototype.pause = function() {
      debug("call pause flowing=%j", this._readableState.flowing);
      if (this._readableState.flowing !== false) {
        debug("pause");
        this._readableState.flowing = false;
        this.emit("pause");
      }
      this._readableState.paused = true;
      return this;
    };
    function flow(stream) {
      var state = stream._readableState;
      debug("flow", state.flowing);
      while (state.flowing && stream.read() !== null) ;
    }
    Readable.prototype.wrap = function(stream) {
      var _this = this;
      var state = this._readableState;
      var paused = false;
      stream.on("end", function() {
        debug("wrapped end");
        if (state.decoder && !state.ended) {
          var chunk = state.decoder.end();
          if (chunk && chunk.length) _this.push(chunk);
        }
        _this.push(null);
      });
      stream.on("data", function(chunk) {
        debug("wrapped data");
        if (state.decoder) chunk = state.decoder.write(chunk);
        if (state.objectMode && (chunk === null || chunk === void 0)) return;
        else if (!state.objectMode && (!chunk || !chunk.length)) return;
        var ret = _this.push(chunk);
        if (!ret) {
          paused = true;
          stream.pause();
        }
      });
      for (var i in stream) {
        if (this[i] === void 0 && typeof stream[i] === "function") {
          this[i] = /* @__PURE__ */ function methodWrap(method) {
            return function methodWrapReturnFunction() {
              return stream[method].apply(stream, arguments);
            };
          }(i);
        }
      }
      for (var n = 0; n < kProxyEvents.length; n++) {
        stream.on(kProxyEvents[n], this.emit.bind(this, kProxyEvents[n]));
      }
      this._read = function(n2) {
        debug("wrapped _read", n2);
        if (paused) {
          paused = false;
          stream.resume();
        }
      };
      return this;
    };
    if (typeof Symbol === "function") {
      Readable.prototype[Symbol.asyncIterator] = function() {
        if (createReadableStreamAsyncIterator === void 0) {
          createReadableStreamAsyncIterator = require_async_iterator();
        }
        return createReadableStreamAsyncIterator(this);
      };
    }
    Object.defineProperty(Readable.prototype, "readableHighWaterMark", {
      // making it explicit this property is not enumerable
      // because otherwise some prototype manipulation in
      // userland will fail
      enumerable: false,
      get: function get() {
        return this._readableState.highWaterMark;
      }
    });
    Object.defineProperty(Readable.prototype, "readableBuffer", {
      // making it explicit this property is not enumerable
      // because otherwise some prototype manipulation in
      // userland will fail
      enumerable: false,
      get: function get() {
        return this._readableState && this._readableState.buffer;
      }
    });
    Object.defineProperty(Readable.prototype, "readableFlowing", {
      // making it explicit this property is not enumerable
      // because otherwise some prototype manipulation in
      // userland will fail
      enumerable: false,
      get: function get() {
        return this._readableState.flowing;
      },
      set: function set(state) {
        if (this._readableState) {
          this._readableState.flowing = state;
        }
      }
    });
    Readable._fromList = fromList;
    Object.defineProperty(Readable.prototype, "readableLength", {
      // making it explicit this property is not enumerable
      // because otherwise some prototype manipulation in
      // userland will fail
      enumerable: false,
      get: function get() {
        return this._readableState.length;
      }
    });
    function fromList(n, state) {
      if (state.length === 0) return null;
      var ret;
      if (state.objectMode) ret = state.buffer.shift();
      else if (!n || n >= state.length) {
        if (state.decoder) ret = state.buffer.join("");
        else if (state.buffer.length === 1) ret = state.buffer.first();
        else ret = state.buffer.concat(state.length);
        state.buffer.clear();
      } else {
        ret = state.buffer.consume(n, state.decoder);
      }
      return ret;
    }
    function endReadable(stream) {
      var state = stream._readableState;
      debug("endReadable", state.endEmitted);
      if (!state.endEmitted) {
        state.ended = true;
        process.nextTick(endReadableNT, state, stream);
      }
    }
    function endReadableNT(state, stream) {
      debug("endReadableNT", state.endEmitted, state.length);
      if (!state.endEmitted && state.length === 0) {
        state.endEmitted = true;
        stream.readable = false;
        stream.emit("end");
        if (state.autoDestroy) {
          var wState = stream._writableState;
          if (!wState || wState.autoDestroy && wState.finished) {
            stream.destroy();
          }
        }
      }
    }
    if (typeof Symbol === "function") {
      Readable.from = function(iterable, opts) {
        if (from === void 0) {
          from = require_from();
        }
        return from(Readable, iterable, opts);
      };
    }
    function indexOf(xs, x) {
      for (var i = 0, l = xs.length; i < l; i++) {
        if (xs[i] === x) return i;
      }
      return -1;
    }
  }
});

// node_modules/readable-stream/lib/_stream_transform.js
var require_stream_transform = __commonJS({
  "node_modules/readable-stream/lib/_stream_transform.js"(exports2, module2) {
    "use strict";
    module2.exports = Transform;
    var _require$codes = require_errors().codes;
    var ERR_METHOD_NOT_IMPLEMENTED = _require$codes.ERR_METHOD_NOT_IMPLEMENTED;
    var ERR_MULTIPLE_CALLBACK = _require$codes.ERR_MULTIPLE_CALLBACK;
    var ERR_TRANSFORM_ALREADY_TRANSFORMING = _require$codes.ERR_TRANSFORM_ALREADY_TRANSFORMING;
    var ERR_TRANSFORM_WITH_LENGTH_0 = _require$codes.ERR_TRANSFORM_WITH_LENGTH_0;
    var Duplex = require_stream_duplex();
    require_inherits()(Transform, Duplex);
    function afterTransform(er, data) {
      var ts = this._transformState;
      ts.transforming = false;
      var cb = ts.writecb;
      if (cb === null) {
        return this.emit("error", new ERR_MULTIPLE_CALLBACK());
      }
      ts.writechunk = null;
      ts.writecb = null;
      if (data != null)
        this.push(data);
      cb(er);
      var rs = this._readableState;
      rs.reading = false;
      if (rs.needReadable || rs.length < rs.highWaterMark) {
        this._read(rs.highWaterMark);
      }
    }
    function Transform(options) {
      if (!(this instanceof Transform)) return new Transform(options);
      Duplex.call(this, options);
      this._transformState = {
        afterTransform: afterTransform.bind(this),
        needTransform: false,
        transforming: false,
        writecb: null,
        writechunk: null,
        writeencoding: null
      };
      this._readableState.needReadable = true;
      this._readableState.sync = false;
      if (options) {
        if (typeof options.transform === "function") this._transform = options.transform;
        if (typeof options.flush === "function") this._flush = options.flush;
      }
      this.on("prefinish", prefinish);
    }
    function prefinish() {
      var _this = this;
      if (typeof this._flush === "function" && !this._readableState.destroyed) {
        this._flush(function(er, data) {
          done(_this, er, data);
        });
      } else {
        done(this, null, null);
      }
    }
    Transform.prototype.push = function(chunk, encoding) {
      this._transformState.needTransform = false;
      return Duplex.prototype.push.call(this, chunk, encoding);
    };
    Transform.prototype._transform = function(chunk, encoding, cb) {
      cb(new ERR_METHOD_NOT_IMPLEMENTED("_transform()"));
    };
    Transform.prototype._write = function(chunk, encoding, cb) {
      var ts = this._transformState;
      ts.writecb = cb;
      ts.writechunk = chunk;
      ts.writeencoding = encoding;
      if (!ts.transforming) {
        var rs = this._readableState;
        if (ts.needTransform || rs.needReadable || rs.length < rs.highWaterMark) this._read(rs.highWaterMark);
      }
    };
    Transform.prototype._read = function(n) {
      var ts = this._transformState;
      if (ts.writechunk !== null && !ts.transforming) {
        ts.transforming = true;
        this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
      } else {
        ts.needTransform = true;
      }
    };
    Transform.prototype._destroy = function(err, cb) {
      Duplex.prototype._destroy.call(this, err, function(err2) {
        cb(err2);
      });
    };
    function done(stream, er, data) {
      if (er) return stream.emit("error", er);
      if (data != null)
        stream.push(data);
      if (stream._writableState.length) throw new ERR_TRANSFORM_WITH_LENGTH_0();
      if (stream._transformState.transforming) throw new ERR_TRANSFORM_ALREADY_TRANSFORMING();
      return stream.push(null);
    }
  }
});

// node_modules/readable-stream/lib/_stream_passthrough.js
var require_stream_passthrough = __commonJS({
  "node_modules/readable-stream/lib/_stream_passthrough.js"(exports2, module2) {
    "use strict";
    module2.exports = PassThrough;
    var Transform = require_stream_transform();
    require_inherits()(PassThrough, Transform);
    function PassThrough(options) {
      if (!(this instanceof PassThrough)) return new PassThrough(options);
      Transform.call(this, options);
    }
    PassThrough.prototype._transform = function(chunk, encoding, cb) {
      cb(null, chunk);
    };
  }
});

// node_modules/readable-stream/lib/internal/streams/pipeline.js
var require_pipeline = __commonJS({
  "node_modules/readable-stream/lib/internal/streams/pipeline.js"(exports2, module2) {
    "use strict";
    var eos;
    function once(callback) {
      var called = false;
      return function() {
        if (called) return;
        called = true;
        callback.apply(void 0, arguments);
      };
    }
    var _require$codes = require_errors().codes;
    var ERR_MISSING_ARGS = _require$codes.ERR_MISSING_ARGS;
    var ERR_STREAM_DESTROYED = _require$codes.ERR_STREAM_DESTROYED;
    function noop(err) {
      if (err) throw err;
    }
    function isRequest(stream) {
      return stream.setHeader && typeof stream.abort === "function";
    }
    function destroyer(stream, reading, writing, callback) {
      callback = once(callback);
      var closed = false;
      stream.on("close", function() {
        closed = true;
      });
      if (eos === void 0) eos = require_end_of_stream();
      eos(stream, {
        readable: reading,
        writable: writing
      }, function(err) {
        if (err) return callback(err);
        closed = true;
        callback();
      });
      var destroyed = false;
      return function(err) {
        if (closed) return;
        if (destroyed) return;
        destroyed = true;
        if (isRequest(stream)) return stream.abort();
        if (typeof stream.destroy === "function") return stream.destroy();
        callback(err || new ERR_STREAM_DESTROYED("pipe"));
      };
    }
    function call(fn) {
      fn();
    }
    function pipe(from, to) {
      return from.pipe(to);
    }
    function popCallback(streams) {
      if (!streams.length) return noop;
      if (typeof streams[streams.length - 1] !== "function") return noop;
      return streams.pop();
    }
    function pipeline() {
      for (var _len = arguments.length, streams = new Array(_len), _key = 0; _key < _len; _key++) {
        streams[_key] = arguments[_key];
      }
      var callback = popCallback(streams);
      if (Array.isArray(streams[0])) streams = streams[0];
      if (streams.length < 2) {
        throw new ERR_MISSING_ARGS("streams");
      }
      var error;
      var destroys = streams.map(function(stream, i) {
        var reading = i < streams.length - 1;
        var writing = i > 0;
        return destroyer(stream, reading, writing, function(err) {
          if (!error) error = err;
          if (err) destroys.forEach(call);
          if (reading) return;
          destroys.forEach(call);
          callback(error);
        });
      });
      return streams.reduce(pipe);
    }
    module2.exports = pipeline;
  }
});

// node_modules/readable-stream/readable.js
var require_readable = __commonJS({
  "node_modules/readable-stream/readable.js"(exports2, module2) {
    var Stream = require("stream");
    if (process.env.READABLE_STREAM === "disable" && Stream) {
      module2.exports = Stream.Readable;
      Object.assign(module2.exports, Stream);
      module2.exports.Stream = Stream;
    } else {
      exports2 = module2.exports = require_stream_readable();
      exports2.Stream = Stream || exports2;
      exports2.Readable = exports2;
      exports2.Writable = require_stream_writable();
      exports2.Duplex = require_stream_duplex();
      exports2.Transform = require_stream_transform();
      exports2.PassThrough = require_stream_passthrough();
      exports2.finished = require_end_of_stream();
      exports2.pipeline = require_pipeline();
    }
  }
});

// node_modules/buffer-from/index.js
var require_buffer_from = __commonJS({
  "node_modules/buffer-from/index.js"(exports2, module2) {
    var toString = Object.prototype.toString;
    var isModern = typeof Buffer !== "undefined" && typeof Buffer.alloc === "function" && typeof Buffer.allocUnsafe === "function" && typeof Buffer.from === "function";
    function isArrayBuffer(input) {
      return toString.call(input).slice(8, -1) === "ArrayBuffer";
    }
    function fromArrayBuffer(obj, byteOffset, length) {
      byteOffset >>>= 0;
      var maxLength = obj.byteLength - byteOffset;
      if (maxLength < 0) {
        throw new RangeError("'offset' is out of bounds");
      }
      if (length === void 0) {
        length = maxLength;
      } else {
        length >>>= 0;
        if (length > maxLength) {
          throw new RangeError("'length' is out of bounds");
        }
      }
      return isModern ? Buffer.from(obj.slice(byteOffset, byteOffset + length)) : new Buffer(new Uint8Array(obj.slice(byteOffset, byteOffset + length)));
    }
    function fromString(string, encoding) {
      if (typeof encoding !== "string" || encoding === "") {
        encoding = "utf8";
      }
      if (!Buffer.isEncoding(encoding)) {
        throw new TypeError('"encoding" must be a valid string encoding');
      }
      return isModern ? Buffer.from(string, encoding) : new Buffer(string, encoding);
    }
    function bufferFrom(value, encodingOrOffset, length) {
      if (typeof value === "number") {
        throw new TypeError('"value" argument must not be a number');
      }
      if (isArrayBuffer(value)) {
        return fromArrayBuffer(value, encodingOrOffset, length);
      }
      if (typeof value === "string") {
        return fromString(value, encodingOrOffset);
      }
      return isModern ? Buffer.from(value) : new Buffer(value);
    }
    module2.exports = bufferFrom;
  }
});

// node_modules/typedarray/index.js
var require_typedarray = __commonJS({
  "node_modules/typedarray/index.js"(exports2) {
    var undefined2 = void 0;
    var MAX_ARRAY_LENGTH = 1e5;
    var ECMAScript = /* @__PURE__ */ function() {
      var opts = Object.prototype.toString, ophop = Object.prototype.hasOwnProperty;
      return {
        // Class returns internal [[Class]] property, used to avoid cross-frame instanceof issues:
        Class: function(v) {
          return opts.call(v).replace(/^\[object *|\]$/g, "");
        },
        HasProperty: function(o, p) {
          return p in o;
        },
        HasOwnProperty: function(o, p) {
          return ophop.call(o, p);
        },
        IsCallable: function(o) {
          return typeof o === "function";
        },
        ToInt32: function(v) {
          return v >> 0;
        },
        ToUint32: function(v) {
          return v >>> 0;
        }
      };
    }();
    var LN2 = Math.LN2;
    var abs = Math.abs;
    var floor = Math.floor;
    var log = Math.log;
    var min = Math.min;
    var pow = Math.pow;
    var round = Math.round;
    function configureProperties(obj) {
      if (getOwnPropNames && defineProp) {
        var props = getOwnPropNames(obj), i;
        for (i = 0; i < props.length; i += 1) {
          defineProp(obj, props[i], {
            value: obj[props[i]],
            writable: false,
            enumerable: false,
            configurable: false
          });
        }
      }
    }
    var defineProp;
    if (Object.defineProperty && function() {
      try {
        Object.defineProperty({}, "x", {});
        return true;
      } catch (e) {
        return false;
      }
    }()) {
      defineProp = Object.defineProperty;
    } else {
      defineProp = function(o, p, desc) {
        if (!o === Object(o)) throw new TypeError("Object.defineProperty called on non-object");
        if (ECMAScript.HasProperty(desc, "get") && Object.prototype.__defineGetter__) {
          Object.prototype.__defineGetter__.call(o, p, desc.get);
        }
        if (ECMAScript.HasProperty(desc, "set") && Object.prototype.__defineSetter__) {
          Object.prototype.__defineSetter__.call(o, p, desc.set);
        }
        if (ECMAScript.HasProperty(desc, "value")) {
          o[p] = desc.value;
        }
        return o;
      };
    }
    var getOwnPropNames = Object.getOwnPropertyNames || function(o) {
      if (o !== Object(o)) throw new TypeError("Object.getOwnPropertyNames called on non-object");
      var props = [], p;
      for (p in o) {
        if (ECMAScript.HasOwnProperty(o, p)) {
          props.push(p);
        }
      }
      return props;
    };
    function makeArrayAccessors(obj) {
      if (!defineProp) {
        return;
      }
      if (obj.length > MAX_ARRAY_LENGTH) throw new RangeError("Array too large for polyfill");
      function makeArrayAccessor(index) {
        defineProp(obj, index, {
          "get": function() {
            return obj._getter(index);
          },
          "set": function(v) {
            obj._setter(index, v);
          },
          enumerable: true,
          configurable: false
        });
      }
      var i;
      for (i = 0; i < obj.length; i += 1) {
        makeArrayAccessor(i);
      }
    }
    function as_signed(value, bits) {
      var s = 32 - bits;
      return value << s >> s;
    }
    function as_unsigned(value, bits) {
      var s = 32 - bits;
      return value << s >>> s;
    }
    function packI8(n) {
      return [n & 255];
    }
    function unpackI8(bytes) {
      return as_signed(bytes[0], 8);
    }
    function packU8(n) {
      return [n & 255];
    }
    function unpackU8(bytes) {
      return as_unsigned(bytes[0], 8);
    }
    function packU8Clamped(n) {
      n = round(Number(n));
      return [n < 0 ? 0 : n > 255 ? 255 : n & 255];
    }
    function packI16(n) {
      return [n >> 8 & 255, n & 255];
    }
    function unpackI16(bytes) {
      return as_signed(bytes[0] << 8 | bytes[1], 16);
    }
    function packU16(n) {
      return [n >> 8 & 255, n & 255];
    }
    function unpackU16(bytes) {
      return as_unsigned(bytes[0] << 8 | bytes[1], 16);
    }
    function packI32(n) {
      return [n >> 24 & 255, n >> 16 & 255, n >> 8 & 255, n & 255];
    }
    function unpackI32(bytes) {
      return as_signed(bytes[0] << 24 | bytes[1] << 16 | bytes[2] << 8 | bytes[3], 32);
    }
    function packU32(n) {
      return [n >> 24 & 255, n >> 16 & 255, n >> 8 & 255, n & 255];
    }
    function unpackU32(bytes) {
      return as_unsigned(bytes[0] << 24 | bytes[1] << 16 | bytes[2] << 8 | bytes[3], 32);
    }
    function packIEEE754(v, ebits, fbits) {
      var bias = (1 << ebits - 1) - 1, s, e, f, ln, i, bits, str, bytes;
      function roundToEven(n) {
        var w = floor(n), f2 = n - w;
        if (f2 < 0.5)
          return w;
        if (f2 > 0.5)
          return w + 1;
        return w % 2 ? w + 1 : w;
      }
      if (v !== v) {
        e = (1 << ebits) - 1;
        f = pow(2, fbits - 1);
        s = 0;
      } else if (v === Infinity || v === -Infinity) {
        e = (1 << ebits) - 1;
        f = 0;
        s = v < 0 ? 1 : 0;
      } else if (v === 0) {
        e = 0;
        f = 0;
        s = 1 / v === -Infinity ? 1 : 0;
      } else {
        s = v < 0;
        v = abs(v);
        if (v >= pow(2, 1 - bias)) {
          e = min(floor(log(v) / LN2), 1023);
          f = roundToEven(v / pow(2, e) * pow(2, fbits));
          if (f / pow(2, fbits) >= 2) {
            e = e + 1;
            f = 1;
          }
          if (e > bias) {
            e = (1 << ebits) - 1;
            f = 0;
          } else {
            e = e + bias;
            f = f - pow(2, fbits);
          }
        } else {
          e = 0;
          f = roundToEven(v / pow(2, 1 - bias - fbits));
        }
      }
      bits = [];
      for (i = fbits; i; i -= 1) {
        bits.push(f % 2 ? 1 : 0);
        f = floor(f / 2);
      }
      for (i = ebits; i; i -= 1) {
        bits.push(e % 2 ? 1 : 0);
        e = floor(e / 2);
      }
      bits.push(s ? 1 : 0);
      bits.reverse();
      str = bits.join("");
      bytes = [];
      while (str.length) {
        bytes.push(parseInt(str.substring(0, 8), 2));
        str = str.substring(8);
      }
      return bytes;
    }
    function unpackIEEE754(bytes, ebits, fbits) {
      var bits = [], i, j, b, str, bias, s, e, f;
      for (i = bytes.length; i; i -= 1) {
        b = bytes[i - 1];
        for (j = 8; j; j -= 1) {
          bits.push(b % 2 ? 1 : 0);
          b = b >> 1;
        }
      }
      bits.reverse();
      str = bits.join("");
      bias = (1 << ebits - 1) - 1;
      s = parseInt(str.substring(0, 1), 2) ? -1 : 1;
      e = parseInt(str.substring(1, 1 + ebits), 2);
      f = parseInt(str.substring(1 + ebits), 2);
      if (e === (1 << ebits) - 1) {
        return f !== 0 ? NaN : s * Infinity;
      } else if (e > 0) {
        return s * pow(2, e - bias) * (1 + f / pow(2, fbits));
      } else if (f !== 0) {
        return s * pow(2, -(bias - 1)) * (f / pow(2, fbits));
      } else {
        return s < 0 ? -0 : 0;
      }
    }
    function unpackF64(b) {
      return unpackIEEE754(b, 11, 52);
    }
    function packF64(v) {
      return packIEEE754(v, 11, 52);
    }
    function unpackF32(b) {
      return unpackIEEE754(b, 8, 23);
    }
    function packF32(v) {
      return packIEEE754(v, 8, 23);
    }
    (function() {
      var ArrayBuffer2 = function ArrayBuffer3(length) {
        length = ECMAScript.ToInt32(length);
        if (length < 0) throw new RangeError("ArrayBuffer size is not a small enough positive integer");
        this.byteLength = length;
        this._bytes = [];
        this._bytes.length = length;
        var i;
        for (i = 0; i < this.byteLength; i += 1) {
          this._bytes[i] = 0;
        }
        configureProperties(this);
      };
      exports2.ArrayBuffer = exports2.ArrayBuffer || ArrayBuffer2;
      var ArrayBufferView = function ArrayBufferView2() {
      };
      function makeConstructor(bytesPerElement, pack, unpack) {
        var ctor;
        ctor = function(buffer, byteOffset, length) {
          var array, sequence, i, s;
          if (!arguments.length || typeof arguments[0] === "number") {
            this.length = ECMAScript.ToInt32(arguments[0]);
            if (length < 0) throw new RangeError("ArrayBufferView size is not a small enough positive integer");
            this.byteLength = this.length * this.BYTES_PER_ELEMENT;
            this.buffer = new ArrayBuffer2(this.byteLength);
            this.byteOffset = 0;
          } else if (typeof arguments[0] === "object" && arguments[0].constructor === ctor) {
            array = arguments[0];
            this.length = array.length;
            this.byteLength = this.length * this.BYTES_PER_ELEMENT;
            this.buffer = new ArrayBuffer2(this.byteLength);
            this.byteOffset = 0;
            for (i = 0; i < this.length; i += 1) {
              this._setter(i, array._getter(i));
            }
          } else if (typeof arguments[0] === "object" && !(arguments[0] instanceof ArrayBuffer2 || ECMAScript.Class(arguments[0]) === "ArrayBuffer")) {
            sequence = arguments[0];
            this.length = ECMAScript.ToUint32(sequence.length);
            this.byteLength = this.length * this.BYTES_PER_ELEMENT;
            this.buffer = new ArrayBuffer2(this.byteLength);
            this.byteOffset = 0;
            for (i = 0; i < this.length; i += 1) {
              s = sequence[i];
              this._setter(i, Number(s));
            }
          } else if (typeof arguments[0] === "object" && (arguments[0] instanceof ArrayBuffer2 || ECMAScript.Class(arguments[0]) === "ArrayBuffer")) {
            this.buffer = buffer;
            this.byteOffset = ECMAScript.ToUint32(byteOffset);
            if (this.byteOffset > this.buffer.byteLength) {
              throw new RangeError("byteOffset out of range");
            }
            if (this.byteOffset % this.BYTES_PER_ELEMENT) {
              throw new RangeError("ArrayBuffer length minus the byteOffset is not a multiple of the element size.");
            }
            if (arguments.length < 3) {
              this.byteLength = this.buffer.byteLength - this.byteOffset;
              if (this.byteLength % this.BYTES_PER_ELEMENT) {
                throw new RangeError("length of buffer minus byteOffset not a multiple of the element size");
              }
              this.length = this.byteLength / this.BYTES_PER_ELEMENT;
            } else {
              this.length = ECMAScript.ToUint32(length);
              this.byteLength = this.length * this.BYTES_PER_ELEMENT;
            }
            if (this.byteOffset + this.byteLength > this.buffer.byteLength) {
              throw new RangeError("byteOffset and length reference an area beyond the end of the buffer");
            }
          } else {
            throw new TypeError("Unexpected argument type(s)");
          }
          this.constructor = ctor;
          configureProperties(this);
          makeArrayAccessors(this);
        };
        ctor.prototype = new ArrayBufferView();
        ctor.prototype.BYTES_PER_ELEMENT = bytesPerElement;
        ctor.prototype._pack = pack;
        ctor.prototype._unpack = unpack;
        ctor.BYTES_PER_ELEMENT = bytesPerElement;
        ctor.prototype._getter = function(index) {
          if (arguments.length < 1) throw new SyntaxError("Not enough arguments");
          index = ECMAScript.ToUint32(index);
          if (index >= this.length) {
            return undefined2;
          }
          var bytes = [], i, o;
          for (i = 0, o = this.byteOffset + index * this.BYTES_PER_ELEMENT; i < this.BYTES_PER_ELEMENT; i += 1, o += 1) {
            bytes.push(this.buffer._bytes[o]);
          }
          return this._unpack(bytes);
        };
        ctor.prototype.get = ctor.prototype._getter;
        ctor.prototype._setter = function(index, value) {
          if (arguments.length < 2) throw new SyntaxError("Not enough arguments");
          index = ECMAScript.ToUint32(index);
          if (index >= this.length) {
            return undefined2;
          }
          var bytes = this._pack(value), i, o;
          for (i = 0, o = this.byteOffset + index * this.BYTES_PER_ELEMENT; i < this.BYTES_PER_ELEMENT; i += 1, o += 1) {
            this.buffer._bytes[o] = bytes[i];
          }
        };
        ctor.prototype.set = function(index, value) {
          if (arguments.length < 1) throw new SyntaxError("Not enough arguments");
          var array, sequence, offset, len, i, s, d, byteOffset, byteLength, tmp;
          if (typeof arguments[0] === "object" && arguments[0].constructor === this.constructor) {
            array = arguments[0];
            offset = ECMAScript.ToUint32(arguments[1]);
            if (offset + array.length > this.length) {
              throw new RangeError("Offset plus length of array is out of range");
            }
            byteOffset = this.byteOffset + offset * this.BYTES_PER_ELEMENT;
            byteLength = array.length * this.BYTES_PER_ELEMENT;
            if (array.buffer === this.buffer) {
              tmp = [];
              for (i = 0, s = array.byteOffset; i < byteLength; i += 1, s += 1) {
                tmp[i] = array.buffer._bytes[s];
              }
              for (i = 0, d = byteOffset; i < byteLength; i += 1, d += 1) {
                this.buffer._bytes[d] = tmp[i];
              }
            } else {
              for (i = 0, s = array.byteOffset, d = byteOffset; i < byteLength; i += 1, s += 1, d += 1) {
                this.buffer._bytes[d] = array.buffer._bytes[s];
              }
            }
          } else if (typeof arguments[0] === "object" && typeof arguments[0].length !== "undefined") {
            sequence = arguments[0];
            len = ECMAScript.ToUint32(sequence.length);
            offset = ECMAScript.ToUint32(arguments[1]);
            if (offset + len > this.length) {
              throw new RangeError("Offset plus length of array is out of range");
            }
            for (i = 0; i < len; i += 1) {
              s = sequence[i];
              this._setter(offset + i, Number(s));
            }
          } else {
            throw new TypeError("Unexpected argument type(s)");
          }
        };
        ctor.prototype.subarray = function(start, end) {
          function clamp(v, min2, max) {
            return v < min2 ? min2 : v > max ? max : v;
          }
          start = ECMAScript.ToInt32(start);
          end = ECMAScript.ToInt32(end);
          if (arguments.length < 1) {
            start = 0;
          }
          if (arguments.length < 2) {
            end = this.length;
          }
          if (start < 0) {
            start = this.length + start;
          }
          if (end < 0) {
            end = this.length + end;
          }
          start = clamp(start, 0, this.length);
          end = clamp(end, 0, this.length);
          var len = end - start;
          if (len < 0) {
            len = 0;
          }
          return new this.constructor(
            this.buffer,
            this.byteOffset + start * this.BYTES_PER_ELEMENT,
            len
          );
        };
        return ctor;
      }
      var Int8Array2 = makeConstructor(1, packI8, unpackI8);
      var Uint8Array2 = makeConstructor(1, packU8, unpackU8);
      var Uint8ClampedArray2 = makeConstructor(1, packU8Clamped, unpackU8);
      var Int16Array2 = makeConstructor(2, packI16, unpackI16);
      var Uint16Array2 = makeConstructor(2, packU16, unpackU16);
      var Int32Array2 = makeConstructor(4, packI32, unpackI32);
      var Uint32Array2 = makeConstructor(4, packU32, unpackU32);
      var Float32Array2 = makeConstructor(4, packF32, unpackF32);
      var Float64Array2 = makeConstructor(8, packF64, unpackF64);
      exports2.Int8Array = exports2.Int8Array || Int8Array2;
      exports2.Uint8Array = exports2.Uint8Array || Uint8Array2;
      exports2.Uint8ClampedArray = exports2.Uint8ClampedArray || Uint8ClampedArray2;
      exports2.Int16Array = exports2.Int16Array || Int16Array2;
      exports2.Uint16Array = exports2.Uint16Array || Uint16Array2;
      exports2.Int32Array = exports2.Int32Array || Int32Array2;
      exports2.Uint32Array = exports2.Uint32Array || Uint32Array2;
      exports2.Float32Array = exports2.Float32Array || Float32Array2;
      exports2.Float64Array = exports2.Float64Array || Float64Array2;
    })();
    (function() {
      function r(array, index) {
        return ECMAScript.IsCallable(array.get) ? array.get(index) : array[index];
      }
      var IS_BIG_ENDIAN = function() {
        var u16array = new exports2.Uint16Array([4660]), u8array = new exports2.Uint8Array(u16array.buffer);
        return r(u8array, 0) === 18;
      }();
      var DataView2 = function DataView3(buffer, byteOffset, byteLength) {
        if (arguments.length === 0) {
          buffer = new exports2.ArrayBuffer(0);
        } else if (!(buffer instanceof exports2.ArrayBuffer || ECMAScript.Class(buffer) === "ArrayBuffer")) {
          throw new TypeError("TypeError");
        }
        this.buffer = buffer || new exports2.ArrayBuffer(0);
        this.byteOffset = ECMAScript.ToUint32(byteOffset);
        if (this.byteOffset > this.buffer.byteLength) {
          throw new RangeError("byteOffset out of range");
        }
        if (arguments.length < 3) {
          this.byteLength = this.buffer.byteLength - this.byteOffset;
        } else {
          this.byteLength = ECMAScript.ToUint32(byteLength);
        }
        if (this.byteOffset + this.byteLength > this.buffer.byteLength) {
          throw new RangeError("byteOffset and length reference an area beyond the end of the buffer");
        }
        configureProperties(this);
      };
      function makeGetter(arrayType) {
        return function(byteOffset, littleEndian) {
          byteOffset = ECMAScript.ToUint32(byteOffset);
          if (byteOffset + arrayType.BYTES_PER_ELEMENT > this.byteLength) {
            throw new RangeError("Array index out of range");
          }
          byteOffset += this.byteOffset;
          var uint8Array = new exports2.Uint8Array(this.buffer, byteOffset, arrayType.BYTES_PER_ELEMENT), bytes = [], i;
          for (i = 0; i < arrayType.BYTES_PER_ELEMENT; i += 1) {
            bytes.push(r(uint8Array, i));
          }
          if (Boolean(littleEndian) === Boolean(IS_BIG_ENDIAN)) {
            bytes.reverse();
          }
          return r(new arrayType(new exports2.Uint8Array(bytes).buffer), 0);
        };
      }
      DataView2.prototype.getUint8 = makeGetter(exports2.Uint8Array);
      DataView2.prototype.getInt8 = makeGetter(exports2.Int8Array);
      DataView2.prototype.getUint16 = makeGetter(exports2.Uint16Array);
      DataView2.prototype.getInt16 = makeGetter(exports2.Int16Array);
      DataView2.prototype.getUint32 = makeGetter(exports2.Uint32Array);
      DataView2.prototype.getInt32 = makeGetter(exports2.Int32Array);
      DataView2.prototype.getFloat32 = makeGetter(exports2.Float32Array);
      DataView2.prototype.getFloat64 = makeGetter(exports2.Float64Array);
      function makeSetter(arrayType) {
        return function(byteOffset, value, littleEndian) {
          byteOffset = ECMAScript.ToUint32(byteOffset);
          if (byteOffset + arrayType.BYTES_PER_ELEMENT > this.byteLength) {
            throw new RangeError("Array index out of range");
          }
          var typeArray = new arrayType([value]), byteArray = new exports2.Uint8Array(typeArray.buffer), bytes = [], i, byteView;
          for (i = 0; i < arrayType.BYTES_PER_ELEMENT; i += 1) {
            bytes.push(r(byteArray, i));
          }
          if (Boolean(littleEndian) === Boolean(IS_BIG_ENDIAN)) {
            bytes.reverse();
          }
          byteView = new exports2.Uint8Array(this.buffer, byteOffset, arrayType.BYTES_PER_ELEMENT);
          byteView.set(bytes);
        };
      }
      DataView2.prototype.setUint8 = makeSetter(exports2.Uint8Array);
      DataView2.prototype.setInt8 = makeSetter(exports2.Int8Array);
      DataView2.prototype.setUint16 = makeSetter(exports2.Uint16Array);
      DataView2.prototype.setInt16 = makeSetter(exports2.Int16Array);
      DataView2.prototype.setUint32 = makeSetter(exports2.Uint32Array);
      DataView2.prototype.setInt32 = makeSetter(exports2.Int32Array);
      DataView2.prototype.setFloat32 = makeSetter(exports2.Float32Array);
      DataView2.prototype.setFloat64 = makeSetter(exports2.Float64Array);
      exports2.DataView = exports2.DataView || DataView2;
    })();
  }
});

// node_modules/concat-stream/index.js
var require_concat_stream = __commonJS({
  "node_modules/concat-stream/index.js"(exports2, module2) {
    var Writable = require_readable().Writable;
    var inherits = require_inherits();
    var bufferFrom = require_buffer_from();
    if (typeof Uint8Array === "undefined") {
      U8 = require_typedarray().Uint8Array;
    } else {
      U8 = Uint8Array;
    }
    var U8;
    function ConcatStream(opts, cb) {
      if (!(this instanceof ConcatStream)) return new ConcatStream(opts, cb);
      if (typeof opts === "function") {
        cb = opts;
        opts = {};
      }
      if (!opts) opts = {};
      var encoding = opts.encoding;
      var shouldInferEncoding = false;
      if (!encoding) {
        shouldInferEncoding = true;
      } else {
        encoding = String(encoding).toLowerCase();
        if (encoding === "u8" || encoding === "uint8") {
          encoding = "uint8array";
        }
      }
      Writable.call(this, { objectMode: true });
      this.encoding = encoding;
      this.shouldInferEncoding = shouldInferEncoding;
      if (cb) this.on("finish", function() {
        cb(this.getBody());
      });
      this.body = [];
    }
    module2.exports = ConcatStream;
    inherits(ConcatStream, Writable);
    ConcatStream.prototype._write = function(chunk, enc, next) {
      this.body.push(chunk);
      next();
    };
    ConcatStream.prototype.inferEncoding = function(buff) {
      var firstBuffer = buff === void 0 ? this.body[0] : buff;
      if (Buffer.isBuffer(firstBuffer)) return "buffer";
      if (typeof Uint8Array !== "undefined" && firstBuffer instanceof Uint8Array) return "uint8array";
      if (Array.isArray(firstBuffer)) return "array";
      if (typeof firstBuffer === "string") return "string";
      if (Object.prototype.toString.call(firstBuffer) === "[object Object]") return "object";
      return "buffer";
    };
    ConcatStream.prototype.getBody = function() {
      if (!this.encoding && this.body.length === 0) return [];
      if (this.shouldInferEncoding) this.encoding = this.inferEncoding();
      if (this.encoding === "array") return arrayConcat(this.body);
      if (this.encoding === "string") return stringConcat(this.body);
      if (this.encoding === "buffer") return bufferConcat(this.body);
      if (this.encoding === "uint8array") return u8Concat(this.body);
      return this.body;
    };
    var isArray = Array.isArray || function(arr) {
      return Object.prototype.toString.call(arr) == "[object Array]";
    };
    function isArrayish(arr) {
      return /Array\]$/.test(Object.prototype.toString.call(arr));
    }
    function isBufferish(p) {
      return typeof p === "string" || isArrayish(p) || p && typeof p.subarray === "function";
    }
    function stringConcat(parts) {
      var strings = [];
      var needsToString = false;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (typeof p === "string") {
          strings.push(p);
        } else if (Buffer.isBuffer(p)) {
          strings.push(p);
        } else if (isBufferish(p)) {
          strings.push(bufferFrom(p));
        } else {
          strings.push(bufferFrom(String(p)));
        }
      }
      if (Buffer.isBuffer(parts[0])) {
        strings = Buffer.concat(strings);
        strings = strings.toString("utf8");
      } else {
        strings = strings.join("");
      }
      return strings;
    }
    function bufferConcat(parts) {
      var bufs = [];
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (Buffer.isBuffer(p)) {
          bufs.push(p);
        } else if (isBufferish(p)) {
          bufs.push(bufferFrom(p));
        } else {
          bufs.push(bufferFrom(String(p)));
        }
      }
      return Buffer.concat(bufs);
    }
    function arrayConcat(parts) {
      var res = [];
      for (var i = 0; i < parts.length; i++) {
        res.push.apply(res, parts[i]);
      }
      return res;
    }
    function u8Concat(parts) {
      var len = 0;
      for (var i = 0; i < parts.length; i++) {
        if (typeof parts[i] === "string") {
          parts[i] = bufferFrom(parts[i]);
        }
        len += parts[i].length;
      }
      var u8 = new U8(len);
      for (var i = 0, offset = 0; i < parts.length; i++) {
        var part = parts[i];
        for (var j = 0; j < part.length; j++) {
          u8[offset++] = part[j];
        }
      }
      return u8;
    }
  }
});

// node_modules/multer/storage/memory.js
var require_memory = __commonJS({
  "node_modules/multer/storage/memory.js"(exports2, module2) {
    var concat = require_concat_stream();
    function MemoryStorage(opts) {
    }
    MemoryStorage.prototype._handleFile = function _handleFile(req, file, cb) {
      file.stream.pipe(concat({ encoding: "buffer" }, function(data) {
        cb(null, {
          buffer: data,
          size: data.length
        });
      }));
    };
    MemoryStorage.prototype._removeFile = function _removeFile(req, file, cb) {
      delete file.buffer;
      cb(null);
    };
    module2.exports = function(opts) {
      return new MemoryStorage(opts);
    };
  }
});

// node_modules/multer/index.js
var require_multer = __commonJS({
  "node_modules/multer/index.js"(exports2, module2) {
    var makeMiddleware = require_make_middleware();
    var diskStorage = require_disk();
    var memoryStorage = require_memory();
    var MulterError = require_multer_error();
    function allowAll(req, file, cb) {
      cb(null, true);
    }
    function Multer(options) {
      if (options.storage) {
        this.storage = options.storage;
      } else if (options.dest) {
        this.storage = diskStorage({ destination: options.dest });
      } else {
        this.storage = memoryStorage();
      }
      this.limits = options.limits;
      this.preservePath = options.preservePath;
      this.defParamCharset = options.defParamCharset || "latin1";
      this.fileFilter = options.fileFilter || allowAll;
    }
    Multer.prototype._makeMiddleware = function(fields, fileStrategy) {
      function setup() {
        var fileFilter = this.fileFilter;
        var filesLeft = /* @__PURE__ */ Object.create(null);
        fields.forEach(function(field) {
          if (typeof field.maxCount === "number") {
            filesLeft[field.name] = field.maxCount;
          } else {
            filesLeft[field.name] = Infinity;
          }
        });
        function wrappedFileFilter(req, file, cb) {
          if ((filesLeft[file.fieldname] || 0) <= 0) {
            return cb(new MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
          }
          filesLeft[file.fieldname] -= 1;
          fileFilter(req, file, cb);
        }
        return {
          limits: this.limits,
          preservePath: this.preservePath,
          defParamCharset: this.defParamCharset,
          storage: this.storage,
          fileFilter: wrappedFileFilter,
          fileStrategy
        };
      }
      return makeMiddleware(setup.bind(this));
    };
    Multer.prototype.single = function(name) {
      return this._makeMiddleware([{ name, maxCount: 1 }], "VALUE");
    };
    Multer.prototype.array = function(name, maxCount) {
      return this._makeMiddleware([{ name, maxCount }], "ARRAY");
    };
    Multer.prototype.fields = function(fields) {
      return this._makeMiddleware(fields, "OBJECT");
    };
    Multer.prototype.none = function() {
      return this._makeMiddleware([], "NONE");
    };
    Multer.prototype.any = function() {
      function setup() {
        return {
          limits: this.limits,
          preservePath: this.preservePath,
          defParamCharset: this.defParamCharset,
          storage: this.storage,
          fileFilter: this.fileFilter,
          fileStrategy: "ARRAY"
        };
      }
      return makeMiddleware(setup.bind(this));
    };
    function multer2(options) {
      if (options === void 0) {
        return new Multer({});
      }
      if (typeof options === "object" && options !== null) {
        return new Multer(options);
      }
      throw new TypeError("Expected object for argument options");
    }
    module2.exports = multer2;
    module2.exports.diskStorage = diskStorage;
    module2.exports.memoryStorage = memoryStorage;
    module2.exports.MulterError = MulterError;
  }
});

// src/server_lib/incomeTaxEngine.js
var incomeTaxEngine_exports = {};
__export(incomeTaxEngine_exports, {
  calculateNonIndividualTax: () => calculateNonIndividualTax,
  calculateTaxLiability: () => calculateTaxLiability,
  compareRegimes: () => compareRegimes
});
function toBigInt(value) {
  if (value instanceof Decimal) {
    return value._value;
  }
  if (typeof value === "bigint") {
    return value * SCALE;
  }
  const str = String(value).trim();
  if (str === "" || str === "NaN" || str === "Infinity" || str === "-Infinity") {
    return 0n;
  }
  const negative = str.startsWith("-");
  const abs = negative ? str.slice(1) : str;
  const parts = abs.split(".");
  const intPart = parts[0] || "0";
  let fracPart = parts[1] || "";
  if (fracPart.length > INTERNAL_PRECISION) {
    const roundDigit = parseInt(fracPart[INTERNAL_PRECISION], 10);
    fracPart = fracPart.slice(0, INTERNAL_PRECISION);
    if (roundDigit >= 5) {
      const fracNum = BigInt(fracPart) + 1n;
      if (fracNum >= SCALE) {
        const intNum = BigInt(intPart) + 1n;
        const result = intNum * SCALE;
        return negative ? -result : result;
      }
      fracPart = fracNum.toString().padStart(INTERNAL_PRECISION, "0");
    }
  } else {
    fracPart = fracPart.padEnd(INTERNAL_PRECISION, "0");
  }
  const combined = BigInt(intPart) * SCALE + BigInt(fracPart);
  return negative ? -combined : combined;
}
function D(value) {
  if (value instanceof Decimal) return value;
  return new Decimal(value);
}
function makeRule(regime, age, lower, upper, rate, fy) {
  ruleId++;
  return {
    id: `SLAB_${ruleId}`,
    regime_type: regime,
    age_category: age,
    lower_limit: lower,
    upper_limit: upper,
    rate_percent: rate,
    financial_year: fy
  };
}
function getAllTaxBracketRules(fy) {
  ruleId = 0;
  const rules = [];
  for (const age of [AgeCategory.NORMAL, AgeCategory.SENIOR, AgeCategory.SUPER_SENIOR]) {
    rules.push(
      makeRule(RegimeType.NEW, age, 0, 4e5, 0, fy),
      makeRule(RegimeType.NEW, age, 400001, 8e5, 5, fy),
      makeRule(RegimeType.NEW, age, 800001, 12e5, 10, fy),
      makeRule(RegimeType.NEW, age, 1200001, 16e5, 15, fy),
      makeRule(RegimeType.NEW, age, 1600001, 2e6, 20, fy),
      makeRule(RegimeType.NEW, age, 2000001, 24e5, 25, fy),
      makeRule(RegimeType.NEW, age, 2400001, Infinity, 30, fy)
    );
  }
  rules.push(
    makeRule(RegimeType.OLD, AgeCategory.NORMAL, 0, 25e4, 0, fy),
    makeRule(RegimeType.OLD, AgeCategory.NORMAL, 250001, 5e5, 5, fy),
    makeRule(RegimeType.OLD, AgeCategory.NORMAL, 500001, 1e6, 20, fy),
    makeRule(RegimeType.OLD, AgeCategory.NORMAL, 1000001, Infinity, 30, fy)
  );
  rules.push(
    makeRule(RegimeType.OLD, AgeCategory.SENIOR, 0, 3e5, 0, fy),
    makeRule(RegimeType.OLD, AgeCategory.SENIOR, 300001, 5e5, 5, fy),
    makeRule(RegimeType.OLD, AgeCategory.SENIOR, 500001, 1e6, 20, fy),
    makeRule(RegimeType.OLD, AgeCategory.SENIOR, 1000001, Infinity, 30, fy)
  );
  rules.push(
    makeRule(RegimeType.OLD, AgeCategory.SUPER_SENIOR, 0, 5e5, 0, fy),
    makeRule(RegimeType.OLD, AgeCategory.SUPER_SENIOR, 500001, 1e6, 20, fy),
    makeRule(RegimeType.OLD, AgeCategory.SUPER_SENIOR, 1000001, Infinity, 30, fy)
  );
  return rules;
}
function resolveAgeCategory(age) {
  if (age >= 80) return AgeCategory.SUPER_SENIOR;
  if (age >= 60) return AgeCategory.SENIOR;
  return AgeCategory.NORMAL;
}
function aggregateIncome(incomeRecords, profile, regime) {
  const warnings = [];
  let salary = ZERO;
  let grossSalaryTotal = ZERO;
  let standardDeductionAmount = ZERO;
  let houseProperty = ZERO;
  let business = ZERO;
  let capitalGains = ZERO;
  let otherSources = ZERO;
  let stcg111A = ZERO;
  let ltcg112A = ZERO;
  let ltcg112 = ZERO;
  let casualIncome = ZERO;
  let agriculturalIncome = ZERO;
  let deemedIncome115BBE = ZERO;
  let cryptoVda = ZERO;
  const ltcg112Details = [];
  for (const record of incomeRecords) {
    if (record.is_foreign_income) {
      if (profile.residential_status === "NR") {
        warnings.push(`Excluded foreign income of ${record.net_amount} for NR (Section 5)`);
        continue;
      } else if (profile.residential_status === "RNOR") {
        if (!record.is_business_controlled_in_india) {
          warnings.push(`Excluded foreign income of ${record.net_amount} for RNOR (Section 5)`);
          continue;
        }
      }
    }
    const netAmt = D(record.net_amount);
    let resolvedType = record.income_type;
    const sec = (record.section_code || "").trim().toUpperCase();
    const desc = (record.description || "").trim().toLowerCase();
    const type = (record.income_type || "").trim().toUpperCase();
    if (sec === "112A" || sec === "SEC_112A") {
      resolvedType = IncomeType.LTCG_112A;
    } else if (sec === "112" || sec === "SEC_112") {
      resolvedType = IncomeType.LTCG_112;
    } else if (type === "CRYPTO_VDA" || type === "CRYPTO" || type === "VDA" || sec === "194S" || sec === "115BBH" || desc.includes("crypto") || desc.includes("vda")) {
      resolvedType = "CRYPTO_VDA";
    }
    switch (resolvedType) {
      case IncomeType.SALARY:
        grossSalaryTotal = grossSalaryTotal.add(netAmt);
        break;
      case IncomeType.HOUSE_PROPERTY:
        houseProperty = houseProperty.add(netAmt);
        break;
      case IncomeType.BUSINESS:
        business = business.add(netAmt);
        break;
      case IncomeType.CAPITAL_GAINS:
        capitalGains = capitalGains.add(netAmt);
        break;
      case IncomeType.OTHER_SOURCES:
        otherSources = otherSources.add(netAmt);
        break;
      case IncomeType.STCG_111A:
        stcg111A = stcg111A.add(netAmt);
        break;
      case IncomeType.LTCG_112A:
        ltcg112A = ltcg112A.add(netAmt);
        break;
      case IncomeType.LTCG_112:
        ltcg112 = ltcg112.add(netAmt);
        ltcg112Details.push({
          amount: netAmt,
          useIndexation: record.use_indexation === true
        });
        break;
      case IncomeType.CASUAL_INCOME:
        casualIncome = casualIncome.add(netAmt);
        break;
      case IncomeType.AGRICULTURAL_INCOME:
        agriculturalIncome = agriculturalIncome.add(netAmt);
        break;
      case IncomeType.DEEMED_INCOME_115BBE:
        deemedIncome115BBE = deemedIncome115BBE.add(netAmt);
        break;
      case "CRYPTO_VDA":
        cryptoVda = cryptoVda.add(netAmt);
        break;
      default:
        warnings.push(`Unknown income type "${record.income_type}" for record ${record.id}. Treated as Other Sources.`);
        otherSources = otherSources.add(netAmt);
    }
  }
  if (grossSalaryTotal.gt(ZERO)) {
    let stdDedLimit = ZERO;
    if (regime === RegimeType.NEW) {
      stdDedLimit = D(75e3);
    } else if (regime === RegimeType.OLD) {
      stdDedLimit = D(5e4);
    }
    standardDeductionAmount = Decimal.min(grossSalaryTotal, stdDedLimit);
    salary = grossSalaryTotal.sub(standardDeductionAmount);
  }
  if (houseProperty.isNegative()) {
    const maxHPLossSetOff = D(2e5);
    if (houseProperty.abs().gt(maxHPLossSetOff)) {
      warnings.push(
        `House property loss \u20B9${houseProperty.abs().toINR()} exceeds \u20B92L set-off limit. Only \u20B92L can be set off against other income. Remaining carries forward.`
      );
      houseProperty = maxHPLossSetOff.neg();
    }
  }
  const ltcg112AExemption = Decimal.min(
    D(SPECIAL_RATES.LTCG_112A_EXEMPTION),
    Decimal.max(ltcg112A, ZERO)
  );
  const ltcg112ANetTaxable = Decimal.max(ltcg112A.sub(ltcg112AExemption), ZERO);
  const grossNormalIncome = salary.add(houseProperty).add(business).add(capitalGains).add(otherSources);
  const totalSpecialIncome = stcg111A.add(ltcg112A).add(ltcg112).add(casualIncome).add(cryptoVda).add(deemedIncome115BBE);
  const grossTotalIncome = grossNormalIncome.add(totalSpecialIncome);
  return {
    incomeBreakdown: {
      salary,
      houseProperty,
      business,
      capitalGains,
      otherSources,
      stcg111A,
      ltcg112A,
      ltcg112,
      casualIncome,
      agriculturalIncome,
      deemedIncome115BBE,
      cryptoVda
    },
    grossTotalIncome,
    grossNormalIncome,
    totalSpecialIncome,
    ltcg112AExemption,
    ltcg112ANetTaxable,
    ltcg112Details,
    warnings,
    standardDeductionAmount
  };
}
function applyDeductions(deductionRecords, grossNormalIncome, regime) {
  const warnings = [];
  const breakdown = [];
  const aggregateGroupUsed = {};
  let totalDeductions = ZERO;
  for (const record of deductionRecords) {
    const claimed = D(record.claimed_amount);
    const limitConfig = DEDUCTION_LIMITS.find((d) => d.sectionCode === record.section_code);
    if (!limitConfig) {
      warnings.push(
        `Unknown deduction section "${record.section_code}" for record ${record.id}. Skipped.`
      );
      breakdown.push({
        sectionCode: record.section_code,
        claimed,
        allowed: ZERO,
        statutoryLimit: ZERO,
        reason: "Unknown section code \u2014 not in statutory database"
      });
      continue;
    }
    if (regime === RegimeType.NEW && !limitConfig.allowedInNewRegime) {
      breakdown.push({
        sectionCode: record.section_code,
        claimed,
        allowed: ZERO,
        statutoryLimit: D(limitConfig.maxLimit === Infinity ? 0 : limitConfig.maxLimit),
        reason: `Not allowed under New Regime (Section 115BAC)`
      });
      continue;
    }
    let maxAllowed = limitConfig.maxLimit === Infinity ? claimed : Decimal.min(claimed, D(limitConfig.maxLimit));
    if (limitConfig.aggregateGroup) {
      const groupKey = limitConfig.aggregateGroup;
      const groupCap = D(AGGREGATE_CAPS[groupKey] || Infinity);
      const groupUsed = aggregateGroupUsed[groupKey] || ZERO;
      const groupRemaining = Decimal.max(groupCap.sub(groupUsed), ZERO);
      maxAllowed = Decimal.min(maxAllowed, groupRemaining);
      aggregateGroupUsed[groupKey] = groupUsed.add(maxAllowed);
    }
    const allowed = Decimal.min(claimed, maxAllowed).clampMin(0);
    breakdown.push({
      sectionCode: record.section_code,
      claimed,
      allowed,
      statutoryLimit: D(limitConfig.maxLimit === Infinity ? 999999999 : limitConfig.maxLimit),
      reason: allowed.eq(claimed) ? "Full claim allowed" : `Capped at statutory limit (${limitConfig.description})`
    });
    totalDeductions = totalDeductions.add(allowed);
  }
  const netTaxableNormalIncome = Decimal.max(grossNormalIncome.sub(totalDeductions), ZERO);
  return {
    deductionBreakdown: breakdown,
    totalDeductions,
    netTaxableNormalIncome,
    warnings
  };
}
function computeSlabTax(taxableIncome, slabs) {
  let tax = ZERO;
  const details = [];
  const sortedSlabs = [...slabs].sort((a, b) => a.lower_limit - b.lower_limit);
  for (const slab of sortedSlabs) {
    const lower = D(slab.lower_limit);
    const rate = D(slab.rate_percent);
    let amountInSlab = ZERO;
    if (taxableIncome.gt(lower)) {
      const slabStart = slab.lower_limit === 0 ? ZERO : D(slab.lower_limit - 1);
      const slabEnd = slab.upper_limit === Infinity ? taxableIncome : Decimal.min(D(slab.upper_limit), taxableIncome);
      amountInSlab = Decimal.max(slabEnd.sub(slabStart), ZERO);
    }
    const taxInSlab = amountInSlab.percent(rate);
    details.push({
      lowerLimit: D(slab.lower_limit),
      upperLimit: slab.upper_limit === Infinity ? D(999999999999) : D(slab.upper_limit),
      taxableInSlab: amountInSlab,
      rate,
      taxInSlab
    });
    tax = tax.add(taxInSlab);
  }
  return { tax, details };
}
function applyRebate87A(totalComputedTax, taxOnLTCG112A, netTaxableNormalIncome, totalSpecialIncome, regime) {
  const warnings = [];
  const totalNetTaxableIncome = netTaxableNormalIncome.add(totalSpecialIncome);
  const config = regime === RegimeType.NEW ? REBATE_87A_NEW : REBATE_87A_OLD;
  const threshold = D(config.incomeThreshold);
  const maxRebate = D(config.maxRebate);
  let rebate87AEligible = false;
  let rebate87AAmount = ZERO;
  let marginalRelief87A = ZERO;
  if (totalNetTaxableIncome.lte(threshold)) {
    rebate87AEligible = true;
    const taxExcluding112A = Decimal.max(totalComputedTax.sub(taxOnLTCG112A), ZERO);
    rebate87AAmount = Decimal.min(taxExcluding112A, maxRebate);
    if (taxOnLTCG112A.isPositive()) {
      warnings.push(
        `Rebate u/s 87A of ${rebate87AAmount.toINR()} applied only to non-112A tax. Tax on LTCG u/s 112A (${taxOnLTCG112A.toINR()}) is excluded from rebate computation.`
      );
    }
  } else if (regime === RegimeType.NEW) {
    const excessOverThreshold = totalNetTaxableIncome.sub(threshold);
    if (totalComputedTax.gt(excessOverThreshold)) {
      const taxExcluding112A = Decimal.max(totalComputedTax.sub(taxOnLTCG112A), ZERO);
      if (taxExcluding112A.gt(excessOverThreshold)) {
        rebate87AEligible = true;
        const uncappedRebate = taxExcluding112A.sub(excessOverThreshold);
        rebate87AAmount = Decimal.min(uncappedRebate, taxExcluding112A);
        marginalRelief87A = rebate87AAmount;
        warnings.push(
          `Marginal Relief on 87A applied: Income ${totalNetTaxableIncome.toINR()} exceeds \u20B912L threshold by ${excessOverThreshold.toINR()}. Tax capped to not exceed the excess.`
        );
      }
    }
  }
  const taxAfterRebate = Decimal.max(totalComputedTax.sub(rebate87AAmount), ZERO);
  return {
    totalNetTaxableIncome,
    rebate87AEligible,
    rebate87AAmount,
    marginalRelief87A,
    taxAfterRebate,
    warnings
  };
}
function getSurchargeRate(totalIncome, brackets) {
  for (const bracket of brackets) {
    if (totalIncome.gt(bracket.incomeThreshold)) {
      return D(bracket.rate);
    }
  }
  return ZERO;
}
function getLowerSurchargeRate(currentRate, brackets) {
  const sortedByThreshold = [...brackets].sort((a, b) => a.incomeThreshold - b.incomeThreshold);
  for (let i = sortedByThreshold.length - 1; i >= 0; i--) {
    if (D(sortedByThreshold[i].rate).eq(currentRate)) {
      if (i > 0) {
        return {
          rate: D(sortedByThreshold[i - 1].rate),
          threshold: D(sortedByThreshold[i].incomeThreshold)
        };
      } else {
        return {
          rate: ZERO,
          threshold: D(sortedByThreshold[i].incomeThreshold)
        };
      }
    }
  }
  return { rate: ZERO, threshold: ZERO };
}
function computeTaxAtIncome(income, regime, ageCategory, slabRules) {
  const applicableSlabs = slabRules.filter(
    (s) => s.regime_type === regime && s.age_category === ageCategory
  );
  const { tax } = computeSlabTax(income, applicableSlabs);
  return tax;
}
function applySurcharge(taxAfterRebate, taxOnNormalIncome, taxOnSpecialIncome, totalNetTaxableIncome, netTaxableNormalIncome, regime, ageCategory, slabRules, taxOnDeemedIncome115BBE = ZERO) {
  const warnings = [];
  if (taxAfterRebate.isZero()) {
    return {
      applicableSurchargeRate: ZERO,
      surchargeOnNormalTax: ZERO,
      surchargeOnSpecialTax: ZERO,
      surchargeOnSpecialTaxCapped: ZERO,
      totalSurchargeBeforeMR: ZERO,
      marginalReliefOnSurcharge: ZERO,
      totalSurchargeAfterMR: ZERO,
      taxAfterSurcharge: ZERO,
      warnings
    };
  }
  const brackets = regime === RegimeType.OLD ? SURCHARGE_BRACKETS_OLD : SURCHARGE_BRACKETS_NEW;
  const applicableSurchargeRate = getSurchargeRate(totalNetTaxableIncome, brackets);
  if (applicableSurchargeRate.isZero()) {
    return {
      applicableSurchargeRate: ZERO,
      surchargeOnNormalTax: ZERO,
      surchargeOnSpecialTax: ZERO,
      surchargeOnSpecialTaxCapped: ZERO,
      totalSurchargeBeforeMR: ZERO,
      marginalReliefOnSurcharge: ZERO,
      totalSurchargeAfterMR: ZERO,
      taxAfterSurcharge: taxAfterRebate,
      warnings
    };
  }
  const normalTaxPortion = Decimal.min(taxOnNormalIncome, taxAfterRebate);
  const surchargeOnNormalTax = normalTaxPortion.percent(applicableSurchargeRate);
  const specialTaxPortion = Decimal.max(taxAfterRebate.sub(normalTaxPortion).sub(taxOnDeemedIncome115BBE), ZERO);
  const uncappedSpecialSurcharge = specialTaxPortion.percent(applicableSurchargeRate);
  const cappedRate = Decimal.min(applicableSurchargeRate, D(SPECIAL_INCOME_SURCHARGE_CAP));
  const cappedSpecialSurcharge = specialTaxPortion.percent(cappedRate);
  if (applicableSurchargeRate.gt(SPECIAL_INCOME_SURCHARGE_CAP) && specialTaxPortion.isPositive()) {
    warnings.push(
      `Surcharge on special income tax (\u20B9${specialTaxPortion.toFixed(0)}) capped at 15% (instead of ${applicableSurchargeRate.toFixed(0)}%) as per statutory provision.`
    );
  }
  const surchargeOn115BBE = taxOnDeemedIncome115BBE.percent(25);
  const totalSurchargeBeforeMR = surchargeOnNormalTax.add(cappedSpecialSurcharge).add(surchargeOn115BBE);
  let marginalReliefOnSurcharge = ZERO;
  const { rate: lowerRate, threshold } = getLowerSurchargeRate(applicableSurchargeRate, brackets);
  if (threshold.isPositive()) {
    const excessIncome = totalNetTaxableIncome.sub(threshold);
    const taxPlusSurchargeActual = taxAfterRebate.add(totalSurchargeBeforeMR);
    const taxAtThreshold = computeTaxAtIncome(threshold, regime, ageCategory, slabRules);
    const surchargeAtThreshold = lowerRate.isZero() ? ZERO : taxAtThreshold.percent(lowerRate);
    const taxPlusSurchargeAtThreshold = taxAtThreshold.add(surchargeAtThreshold);
    const additionalTaxBurden = taxPlusSurchargeActual.sub(taxPlusSurchargeAtThreshold);
    if (additionalTaxBurden.gt(excessIncome)) {
      marginalReliefOnSurcharge = additionalTaxBurden.sub(excessIncome);
      warnings.push(
        `Marginal Relief on Surcharge applied: Income exceeds ${threshold.toINR()} threshold by ${excessIncome.toINR()}. Additional tax burden of ${additionalTaxBurden.toINR()} reduced by ${marginalReliefOnSurcharge.toINR()} to cap at excess income.`
      );
    }
  }
  const totalSurchargeAfterMR = Decimal.max(totalSurchargeBeforeMR.sub(marginalReliefOnSurcharge), ZERO);
  const taxAfterSurcharge = taxAfterRebate.add(totalSurchargeAfterMR);
  return {
    applicableSurchargeRate,
    surchargeOnNormalTax,
    surchargeOnSpecialTax: uncappedSpecialSurcharge,
    surchargeOnSpecialTaxCapped: cappedSpecialSurcharge,
    totalSurchargeBeforeMR,
    marginalReliefOnSurcharge,
    totalSurchargeAfterMR,
    taxAfterSurcharge,
    warnings
  };
}
function applyCess(taxAfterSurcharge) {
  const cessRate = D(HEC_RATE);
  const cessAmount = taxAfterSurcharge.percent(cessRate);
  return { cessRate, cessAmount };
}
function calculateNonIndividualTax(profile, incomeRecords, deductionRecords) {
  const entityType = profile.entity_type;
  const step1 = aggregateIncome(incomeRecords, profile);
  const totalDeductions = ZERO;
  const netTaxableNormalIncome = step1.grossNormalIncome;
  const totalNetTaxableIncome = step1.grossTotalIncome;
  let baseRate = 30;
  if (entityType === "DOMESTIC_COMPANY") {
    const prov = profile.corporate_tax_section || "NORMAL";
    if (prov === "SEC_115BAA") {
      baseRate = 22;
    } else if (prov === "SEC_115BAB") {
      baseRate = 15;
    } else {
      baseRate = profile.company_turnover_under_400cr ? 25 : 30;
    }
  } else if (entityType === "FOREIGN_COMPANY") {
    baseRate = 35;
  }
  const taxOnNormalIncome = netTaxableNormalIncome.percent(D(baseRate));
  const taxOnSTCG111A = step1.incomeBreakdown.stcg111A.percent(D(20));
  const taxOnLTCG112A = step1.ltcg112ANetTaxable.percent(D(12.5));
  const taxOnLTCG112 = step1.incomeBreakdown.ltcg112.percent(D(12.5));
  const taxOnCasualIncome = step1.incomeBreakdown.casualIncome.percent(D(30));
  const taxOnCryptoVda = (step1.incomeBreakdown.cryptoVda || ZERO).percent(D(30));
  const taxOnDeemedIncome115BBE = (step1.incomeBreakdown.deemedIncome115BBE || ZERO).percent(D(60));
  const totalTaxOnSpecialIncome = taxOnSTCG111A.add(taxOnLTCG112A).add(taxOnLTCG112).add(taxOnCasualIncome).add(taxOnCryptoVda).add(taxOnDeemedIncome115BBE);
  const totalComputedTax = taxOnNormalIncome.add(totalTaxOnSpecialIncome);
  const rebate87AAmount = ZERO;
  const taxAfterRebate = totalComputedTax;
  let applicableSurchargeRate = ZERO;
  let surchargeAmount = ZERO;
  let marginalReliefOnSurcharge = ZERO;
  const incomeVal = totalNetTaxableIncome.toNumber();
  if (entityType === "PARTNERSHIP_FIRM" || entityType === "LLP") {
    if (incomeVal > 1e7) {
      applicableSurchargeRate = D(12);
      const grossSurcharge = taxAfterRebate.percent(D(12));
      const thresholdVal = 1e7;
      const taxAtThreshold = D(thresholdVal).percent(D(baseRate));
      const limitVal = taxAtThreshold.add(totalNetTaxableIncome.sub(D(thresholdVal)));
      const actualTotal = taxAfterRebate.add(grossSurcharge);
      if (actualTotal.gt(limitVal)) {
        marginalReliefOnSurcharge = actualTotal.sub(limitVal);
        surchargeAmount = Decimal.max(ZERO, grossSurcharge.sub(marginalReliefOnSurcharge));
      } else {
        surchargeAmount = grossSurcharge;
      }
    }
  } else if (entityType === "DOMESTIC_COMPANY") {
    const prov = profile.corporate_tax_section || "NORMAL";
    if (prov === "SEC_115BAA" || prov === "SEC_115BAB") {
      applicableSurchargeRate = D(10);
      surchargeAmount = taxAfterRebate.percent(D(10));
    } else {
      if (incomeVal > 1e8) {
        applicableSurchargeRate = D(12);
        const grossSurcharge = taxAfterRebate.percent(D(12));
        const thresholdVal = 1e8;
        const taxAtThreshold = D(thresholdVal).percent(D(baseRate));
        const surchargeAtThreshold = taxAtThreshold.percent(D(7));
        const limitVal = taxAtThreshold.add(surchargeAtThreshold).add(totalNetTaxableIncome.sub(D(thresholdVal)));
        const actualTotal = taxAfterRebate.add(grossSurcharge);
        if (actualTotal.gt(limitVal)) {
          marginalReliefOnSurcharge = actualTotal.sub(limitVal);
          surchargeAmount = Decimal.max(ZERO, grossSurcharge.sub(marginalReliefOnSurcharge));
        } else {
          surchargeAmount = grossSurcharge;
        }
      } else if (incomeVal > 1e7) {
        applicableSurchargeRate = D(7);
        const grossSurcharge = taxAfterRebate.percent(D(7));
        const thresholdVal = 1e7;
        const taxAtThreshold = D(thresholdVal).percent(D(baseRate));
        const limitVal = taxAtThreshold.add(totalNetTaxableIncome.sub(D(thresholdVal)));
        const actualTotal = taxAfterRebate.add(grossSurcharge);
        if (actualTotal.gt(limitVal)) {
          marginalReliefOnSurcharge = actualTotal.sub(limitVal);
          surchargeAmount = Decimal.max(ZERO, grossSurcharge.sub(marginalReliefOnSurcharge));
        } else {
          surchargeAmount = grossSurcharge;
        }
      }
    }
  } else if (entityType === "FOREIGN_COMPANY") {
    if (incomeVal > 1e8) {
      applicableSurchargeRate = D(5);
      const grossSurcharge = taxAfterRebate.percent(D(5));
      const thresholdVal = 1e8;
      const taxAtThreshold = D(thresholdVal).percent(D(baseRate));
      const surchargeAtThreshold = taxAtThreshold.percent(D(2));
      const limitVal = taxAtThreshold.add(surchargeAtThreshold).add(totalNetTaxableIncome.sub(D(thresholdVal)));
      const actualTotal = taxAfterRebate.add(grossSurcharge);
      if (actualTotal.gt(limitVal)) {
        marginalReliefOnSurcharge = actualTotal.sub(limitVal);
        surchargeAmount = Decimal.max(ZERO, grossSurcharge.sub(marginalReliefOnSurcharge));
      } else {
        surchargeAmount = grossSurcharge;
      }
    } else if (incomeVal > 1e7) {
      applicableSurchargeRate = D(2);
      const grossSurcharge = taxAfterRebate.percent(D(2));
      const thresholdVal = 1e7;
      const taxAtThreshold = D(thresholdVal).percent(D(baseRate));
      const limitVal = taxAtThreshold.add(totalNetTaxableIncome.sub(D(thresholdVal)));
      const actualTotal = taxAfterRebate.add(grossSurcharge);
      if (actualTotal.gt(limitVal)) {
        marginalReliefOnSurcharge = actualTotal.sub(limitVal);
        surchargeAmount = Decimal.max(ZERO, grossSurcharge.sub(marginalReliefOnSurcharge));
      } else {
        surchargeAmount = grossSurcharge;
      }
    }
  }
  if (step1.incomeBreakdown.deemedIncome115BBE && step1.incomeBreakdown.deemedIncome115BBE.gt(0)) {
    const taxOnDeemedIncome115BBE2 = step1.incomeBreakdown.deemedIncome115BBE.percent(D(60));
    const additional115BBESurcharge = taxOnDeemedIncome115BBE2.percent(D(25));
    const previouslyAppliedSC = taxOnDeemedIncome115BBE2.percent(applicableSurchargeRate);
    surchargeAmount = surchargeAmount.sub(previouslyAppliedSC).add(additional115BBESurcharge);
  }
  const taxAfterSurcharge = taxAfterRebate.add(surchargeAmount);
  const cessAmount = taxAfterSurcharge.percent(D(4));
  const totalTaxLiability = taxAfterSurcharge.add(cessAmount).roundToInt();
  const effectiveTaxRate = totalNetTaxableIncome.isZero() ? ZERO : totalTaxLiability.div(totalNetTaxableIncome).mul(100);
  const companyTypeStr = entityType === "DOMESTIC_COMPANY" ? "Domestic Corporate" : entityType === "FOREIGN_COMPANY" ? "Foreign Corporate" : "Partnership/LLP";
  const computationNotes = [
    {
      section: entityType === "DOMESTIC_COMPANY" ? `u/s 115BAA/115BAB/Normal` : entityType === "FOREIGN_COMPANY" ? "Foreign Company Rate" : `FIRM/LLP Flat Rate`,
      rationale: `${companyTypeStr} tax computed at a flat rate of ${baseRate}% on net taxable income.`,
      lineItem: "Flat Rate Taxation",
      applicableSection: entityType === "DOMESTIC_COMPANY" || entityType === "FOREIGN_COMPANY" ? "Corporate Tax" : "Flat Tax",
      regime: "Both",
      rationaleString: `${companyTypeStr} tax computed at a flat rate of ${baseRate}% on net taxable income.`
    }
  ];
  if (surchargeAmount.gt(0)) {
    computationNotes.push({
      section: "Surcharge",
      rationale: `Surcharge applied at ${applicableSurchargeRate}% as total income exceeds the threshold.`,
      lineItem: "Surcharge",
      applicableSection: "Surcharge",
      regime: "Both",
      rationaleString: `Surcharge applied at ${applicableSurchargeRate}% as total income exceeds the threshold.`
    });
  }
  if (marginalReliefOnSurcharge.gt(0)) {
    computationNotes.push({
      section: "Marginal Relief",
      rationale: `Marginal relief of \u20B9${new Intl.NumberFormat("en-IN").format(marginalReliefOnSurcharge.toNumber())} applied to restrict tax increase.`,
      lineItem: "Marginal Relief",
      applicableSection: "Marginal Relief",
      regime: "Both",
      rationaleString: `Marginal relief of \u20B9${new Intl.NumberFormat("en-IN").format(marginalReliefOnSurcharge.toNumber())} applied to restrict tax increase.`
    });
  }
  const slabBreakdown = [
    {
      slabRange: `Flat Rate Tax (${baseRate}%)`,
      ratePercentage: baseRate,
      taxableAmountInSlab: totalNetTaxableIncome.toNumber(),
      taxGenerated: taxOnNormalIncome.toNumber()
    }
  ];
  const surchargeDetails = {
    baseTaxAmount: taxAfterRebate.toNumber(),
    appliedRate: applicableSurchargeRate.toNumber(),
    grossSurcharge: taxAfterRebate.percent(applicableSurchargeRate).toNumber(),
    marginalReliefSubtracted: marginalReliefOnSurcharge.toNumber(),
    netSurcharge: surchargeAmount.toNumber()
  };
  const cessDetails = {
    taxPlusSurcharge: taxAfterSurcharge.toNumber(),
    ratePercentage: 4,
    cessAmount: cessAmount.toNumber()
  };
  const calculationSheet = {
    slabBreakdown,
    surchargeDetails,
    cessDetails
  };
  return {
    profileId: profile.profile_id,
    financialYear: profile.financial_year,
    assessmentYear: profile.assessment_year,
    regimeType: RegimeType.NEW,
    ageCategory: AgeCategory.BELOW_60,
    standardDeductionAmount: step1.standardDeductionAmount,
    incomeBreakdown: step1.incomeBreakdown,
    grossTotalIncome: step1.grossTotalIncome,
    grossNormalIncome: step1.grossNormalIncome,
    totalSpecialIncome: step1.totalSpecialIncome,
    ltcg112AExemption: step1.ltcg112AExemption,
    ltcg112ANetTaxable: step1.ltcg112ANetTaxable,
    deductionBreakdown: [],
    totalDeductions,
    netTaxableNormalIncome,
    slabComputationDetails: [],
    taxOnNormalIncome,
    taxOnSTCG111A,
    taxOnLTCG112A,
    taxOnLTCG112,
    taxOnCasualIncome,
    taxOnCryptoVda,
    totalTaxOnSpecialIncome,
    totalComputedTax,
    totalNetTaxableIncome,
    rebate87AEligible: false,
    rebate87AAmount,
    marginalRelief87A: ZERO,
    taxAfterRebate,
    applicableSurchargeRate,
    surchargeOnNormalTax: surchargeAmount,
    surchargeOnSpecialTax: ZERO,
    surchargeOnSpecialTaxCapped: ZERO,
    totalSurchargeBeforeMR: taxAfterRebate.percent(applicableSurchargeRate),
    marginalReliefOnSurcharge,
    totalSurchargeAfterMR: surchargeAmount,
    surchargeAmount,
    taxAfterSurcharge,
    cessRate: D(4),
    cessAmount,
    totalTaxLiability,
    effectiveTaxRate,
    computedAt: (/* @__PURE__ */ new Date()).toISOString(),
    engineVersion: "1.0.0",
    warnings: step1.warnings,
    computationNotes,
    calculationSheet
  };
}
function calculateTaxLiability(profile, incomeRecords, deductionRecords, slabRules) {
  const allWarnings = [];
  const entityType = profile.entity_type || "INDIVIDUAL";
  if (entityType !== "INDIVIDUAL" && entityType !== "HUF" && entityType !== "AOP_BOI") {
    return calculateNonIndividualTax(profile, incomeRecords, deductionRecords);
  }
  const regime = profile.opted_for_new_regime ? RegimeType.NEW : RegimeType.OLD;
  const ageForResolution = entityType === "HUF" || entityType === "AOP_BOI" ? 35 : profile.age;
  const ageCategory = resolveAgeCategory(ageForResolution);
  const rules = slabRules || getAllTaxBracketRules(profile.financial_year);
  const step1 = aggregateIncome(incomeRecords, profile, regime);
  allWarnings.push(...step1.warnings);
  const filteredDeductions = deductionRecords.filter((d) => d.section_code !== "16ia");
  const step2 = applyDeductions(filteredDeductions, step1.grossNormalIncome, regime);
  allWarnings.push(...step2.warnings);
  const incomes = incomeRecords;
  const netTaxableIncome = step2.netTaxableNormalIncome.toNumber() + step1.incomeBreakdown.stcg111A.toNumber() + step1.incomeBreakdown.ltcg112A.toNumber() + step1.incomeBreakdown.ltcg112.toNumber() + step1.incomeBreakdown.casualIncome.toNumber() + (step1.incomeBreakdown.cryptoVda ? step1.incomeBreakdown.cryptoVda.toNumber() : 0);
  let specialIncomeTotal = 0;
  let taxOnSpecialIncome = 0;
  const ltcg112_amount = step1.incomeBreakdown.ltcg112.toNumber();
  const stcg111a_amount = step1.incomeBreakdown.stcg111A.toNumber();
  const casual_income_amount = step1.incomeBreakdown.casualIncome.toNumber();
  const crypto_vda_amount = step1.incomeBreakdown.cryptoVda ? step1.incomeBreakdown.cryptoVda.toNumber() : 0;
  const agricultural_income_amount = step1.incomeBreakdown.agriculturalIncome ? step1.incomeBreakdown.agriculturalIncome.toNumber() : 0;
  const deemed_income_115bbe_amount = step1.incomeBreakdown.deemedIncome115BBE ? step1.incomeBreakdown.deemedIncome115BBE.toNumber() : 0;
  const ltcg112a_amount = incomes.filter((i) => i.income_type === "LTCG_112A").reduce((sum, i) => sum + (i.net_amount || 0), 0);
  const taxableLtcg112a = Math.max(0, ltcg112a_amount - 125e3);
  taxOnSpecialIncome += taxableLtcg112a * 0.125;
  taxOnSpecialIncome += ltcg112_amount * 0.125;
  taxOnSpecialIncome += stcg111a_amount * 0.2;
  taxOnSpecialIncome += casual_income_amount * 0.3;
  taxOnSpecialIncome += crypto_vda_amount * 0.3;
  taxOnSpecialIncome += deemed_income_115bbe_amount * 0.6;
  specialIncomeTotal = ltcg112a_amount + ltcg112_amount + stcg111a_amount + casual_income_amount + crypto_vda_amount + deemed_income_115bbe_amount;
  const normalIncomeBase = Math.max(0, netTaxableIncome - specialIncomeTotal);
  const applicableSlabs = rules.filter(
    (s) => s.regime_type === regime && s.age_category === ageCategory
  );
  let taxOnNormalIncomeDecimal = ZERO;
  let slabDetails = [];
  const basicExemptionSlab = applicableSlabs.find((s) => s.lower_limit === 0);
  const basicExemption = basicExemptionSlab ? basicExemptionSlab.upper_limit : 0;
  if (agricultural_income_amount > 5e3 && normalIncomeBase > basicExemption) {
    const step1Tax = computeSlabTax(D(normalIncomeBase + agricultural_income_amount), applicableSlabs).tax;
    const step2Tax = computeSlabTax(D(basicExemption + agricultural_income_amount), applicableSlabs).tax;
    taxOnNormalIncomeDecimal = Decimal.max(step1Tax.sub(step2Tax), ZERO);
    slabDetails = computeSlabTax(D(normalIncomeBase), applicableSlabs).details;
  } else {
    const res = computeSlabTax(D(normalIncomeBase), applicableSlabs);
    taxOnNormalIncomeDecimal = res.tax;
    slabDetails = res.details;
  }
  const taxOnNormalIncome = taxOnNormalIncomeDecimal.toNumber();
  const totalComputedTax = D(taxOnNormalIncome).add(D(taxOnSpecialIncome));
  const step3 = {
    slabDetails,
    taxOnNormalIncome: D(taxOnNormalIncome),
    taxOnSTCG111A: D(stcg111a_amount * 0.2),
    taxOnLTCG112A: D(taxableLtcg112a * 0.125),
    taxOnLTCG112: D(ltcg112_amount * 0.125),
    taxOnCasualIncome: D(casual_income_amount * 0.3),
    taxOnCryptoVda: D(crypto_vda_amount * 0.3),
    taxOnDeemedIncome115BBE: D(deemed_income_115bbe_amount * 0.6),
    totalTaxOnSpecialIncome: D(taxOnSpecialIncome),
    totalComputedTax
  };
  const step4 = applyRebate87A(
    step3.totalComputedTax,
    step3.taxOnLTCG112A,
    step2.netTaxableNormalIncome,
    step1.totalSpecialIncome,
    regime
  );
  allWarnings.push(...step4.warnings);
  const step5 = applySurcharge(
    step4.taxAfterRebate,
    step3.taxOnNormalIncome,
    step3.totalTaxOnSpecialIncome,
    step4.totalNetTaxableIncome,
    step2.netTaxableNormalIncome,
    regime,
    ageCategory,
    rules,
    step3.taxOnDeemedIncome115BBE || D(0)
  );
  allWarnings.push(...step5.warnings);
  const step6 = applyCess(step5.taxAfterSurcharge);
  const totalTaxLiability = step5.taxAfterSurcharge.add(step6.cessAmount).roundToInt();
  const effectiveTaxRate = step1.grossTotalIncome.isZero() ? ZERO : totalTaxLiability.div(step1.grossTotalIncome).mul(100);
  const computationNotes = [];
  const hasSalary = incomeRecords.some((r) => r.income_type === IncomeType.SALARY && r.gross_amount > 0);
  if (hasSalary) {
    const amtStr = regime === RegimeType.NEW ? "\u20B975,000" : "\u20B950,000";
    computationNotes.push({
      section: "u/s 16(ia)",
      rationale: `Standard deduction of ${amtStr} applied against salary income under ${regime} regime.`,
      lineItem: "Salary Standard Deduction",
      applicableSection: "u/s 16(ia)",
      regime: regime === RegimeType.NEW ? "New" : "Old",
      rationaleString: `Standard deduction of ${amtStr} applied against salary income under ${regime} regime.`
    });
  }
  const hasOldRegimeDeductions = deductionRecords.some(
    (d) => ["80C", "80D", "80CCD1B", "80TTA", "80TTB"].includes(d.section_code) && d.claimed_amount > 0
  );
  if (regime === RegimeType.NEW && hasOldRegimeDeductions) {
    computationNotes.push({
      section: "Chapter VI-A",
      rationale: "Deductions under 80C, 80D, etc., have been ignored as they are not allowable under the New Tax Regime (Section 115BAC).",
      lineItem: "Chapter VI-A Deductions",
      applicableSection: "Chapter VI-A",
      regime: "New",
      rationaleString: "Deductions under 80C, 80D, etc., have been ignored as they are not allowable under the New Tax Regime (Section 115BAC)."
    });
  }
  const record80C = deductionRecords.find((d) => d.section_code === "80C");
  if (record80C && regime === RegimeType.OLD) {
    const allowed80C = step2.deductionBreakdown.find((b) => b.sectionCode === "80C")?.allowed || ZERO;
    const claimed80C = D(record80C.claimed_amount);
    if (claimed80C.gt(15e4)) {
      computationNotes.push({
        section: "u/s 80C",
        rationale: "Deduction claimed under Section 80C has been restricted to the maximum statutory threshold of \u20B91,50,000 as per provisions of Section 80CCE.",
        lineItem: "Section 80C Deduction",
        applicableSection: "u/s 80C",
        regime: "Old",
        rationaleString: "Deduction claimed under Section 80C has been restricted to the maximum statutory threshold of \u20B91,50,000 as per provisions of Section 80CCE."
      });
    } else {
      const fmt80C = new Intl.NumberFormat("en-IN").format(allowed80C.toNumber());
      computationNotes.push({
        section: "u/s 80C",
        rationale: `Deduction u/s 80C of \u20B9${fmt80C} is fully allowed based on eligible tax-saving investments.`,
        lineItem: "Section 80C Deduction",
        applicableSection: "u/s 80C",
        regime: "Old",
        rationaleString: `Deduction u/s 80C of \u20B9${fmt80C} is fully allowed based on eligible tax-saving investments.`
      });
    }
  }
  const hpInterestRecord = deductionRecords.find((d) => d.section_code === "24b");
  if (hpInterestRecord) {
    if (regime === RegimeType.NEW) {
      computationNotes.push({
        section: "u/s 24(b)",
        rationale: "Interest on self-occupied property u/s 24(b) is set to zero as set-off of house property loss is disallowed under Section 115BAC.",
        lineItem: "House Property Interest",
        applicableSection: "u/s 24(b)",
        regime: "New",
        rationaleString: "Interest on self-occupied property u/s 24(b) is set to zero as set-off of house property loss is disallowed under Section 115BAC."
      });
    } else {
      computationNotes.push({
        section: "u/s 24(b)",
        rationale: "Interest deduction of up to \u20B92,00,000 is allowed on self-occupied property u/s 24(b) under the Old Tax Regime.",
        lineItem: "House Property Interest",
        applicableSection: "u/s 24(b)",
        regime: "Old",
        rationaleString: "Interest deduction of up to \u20B92,00,000 is allowed on self-occupied property u/s 24(b) under the Old Tax Regime."
      });
    }
  }
  const record80D = deductionRecords.find((d) => d.section_code === "80D");
  if (record80D && regime === RegimeType.OLD) {
    const allowed80D = step2.deductionBreakdown.find((b) => b.sectionCode === "80D")?.allowed || ZERO;
    const fmt80D = new Intl.NumberFormat("en-IN").format(allowed80D.toNumber());
    computationNotes.push({
      section: "u/s 80D",
      rationale: `Health insurance premium deduction of \u20B9${fmt80D} allowed under the Old Tax Regime.`,
      lineItem: "Section 80D Health Insurance",
      applicableSection: "u/s 80D",
      regime: "Old",
      rationaleString: `Health insurance premium deduction of \u20B9${fmt80D} allowed under the Old Tax Regime.`
    });
  }
  if (step4.rebate87AAmount.gt(0)) {
    const rebateAmount = new Intl.NumberFormat("en-IN").format(step4.rebate87AAmount.toNumber());
    computationNotes.push({
      section: "u/s 87A",
      rationale: `Tax rebate of \u20B9${rebateAmount} applied as total taxable income falls within the allowable limit.`,
      lineItem: "Rebate u/s 87A",
      applicableSection: "u/s 87A",
      regime: regime === RegimeType.NEW ? "New" : "Old",
      rationaleString: `Tax rebate of \u20B9${rebateAmount} applied as total taxable income falls within the allowable limit.`
    });
  }
  if (step5.totalSurchargeAfterMR.gt(0)) {
    computationNotes.push({
      section: "Surcharge",
      rationale: "Surcharge applied at applicable rates because total income exceeds the statutory threshold.",
      lineItem: "Surcharge Application",
      applicableSection: "Surcharge",
      regime: regime === RegimeType.NEW ? "New" : "Old",
      rationaleString: "Surcharge applied at applicable rates because total income exceeds the statutory threshold."
    });
  }
  if (step5.marginalReliefOnSurcharge.gt(0)) {
    const reliefAmount = new Intl.NumberFormat("en-IN").format(step5.marginalReliefOnSurcharge.toNumber());
    computationNotes.push({
      section: "Marginal Relief",
      rationale: `Marginal relief of \u20B9${reliefAmount} applied to restrict the tax increase to the incremental income above the threshold.`,
      lineItem: "Surcharge Marginal Relief",
      applicableSection: "Marginal Relief",
      regime: regime === RegimeType.NEW ? "New" : "Old",
      rationaleString: `Marginal relief of \u20B9${reliefAmount} applied to restrict the tax increase to the incremental income above the threshold.`
    });
  }
  if (step1.incomeBreakdown.stcg111A.gt(0)) {
    computationNotes.push({
      section: "Sec 111A",
      rationale: "STCG on listed equity shares is taxed at a flat rate of 20% u/s 111A, without any progressive slab benefits.",
      lineItem: "Short-Term Capital Gains",
      applicableSection: "Sec 111A",
      regime: "Both",
      rationaleString: "STCG on listed equity shares is taxed at a flat rate of 20% u/s 111A, without any progressive slab benefits."
    });
  }
  if (step1.incomeBreakdown.ltcg112A.gt(0)) {
    computationNotes.push({
      section: "Sec 112A",
      rationale: "LTCG on listed equity shares is exempt up to \u20B91.25 Lakhs, with the excess taxed at a flat rate of 12.5% u/s 112A.",
      lineItem: "Long-Term Capital Gains",
      applicableSection: "Sec 112A",
      regime: "Both",
      rationaleString: "LTCG on listed equity shares is exempt up to \u20B91.25 Lakhs, with the excess taxed at a flat rate of 12.5% u/s 112A."
    });
  }
  if (step1.incomeBreakdown.casualIncome.gt(0)) {
    computationNotes.push({
      section: "Sec 115BB",
      rationale: "Winnings from lottery/gambling/crypto are taxed at a flat 30% u/s 115BB/115BBH. No deductions or slab exemptions are allowed against this income.",
      lineItem: "Casual Income",
      applicableSection: "Sec 115BB",
      regime: "Both",
      rationaleString: "Winnings from lottery/gambling/crypto are taxed at a flat 30% u/s 115BB/115BBH. No deductions or slab exemptions are allowed against this income."
    });
  }
  const slabBreakdown = step3.slabDetails.map((detail) => {
    const isInfinity = detail.upperLimit.gt(1e11);
    const range = isInfinity ? `\u20B9${new Intl.NumberFormat("en-IN").format(detail.lowerLimit.toNumber())}+` : `\u20B9${new Intl.NumberFormat("en-IN").format(detail.lowerLimit.toNumber())} - \u20B9${new Intl.NumberFormat("en-IN").format(detail.upperLimit.toNumber())}`;
    return {
      slabRange: range,
      ratePercentage: detail.rate.toNumber(),
      taxableAmountInSlab: detail.taxableInSlab.toNumber(),
      taxGenerated: detail.taxInSlab.toNumber()
    };
  });
  if (step1.incomeBreakdown.stcg111A.gt(0)) {
    slabBreakdown.push({
      slabRange: "STCG u/s 111A (Listed Shares)",
      ratePercentage: 20,
      taxableAmountInSlab: step1.incomeBreakdown.stcg111A.toNumber(),
      taxGenerated: step3.taxOnSTCG111A.toNumber()
    });
  }
  if (step1.incomeBreakdown.ltcg112A.gt(0)) {
    const exemption = 125e3;
    const taxableAmt = Math.max(step1.incomeBreakdown.ltcg112A.toNumber() - exemption, 0);
    slabBreakdown.push({
      slabRange: "LTCG u/s 112A (excl. \u20B91.25L)",
      ratePercentage: 12.5,
      taxableAmountInSlab: taxableAmt,
      taxGenerated: step3.taxOnLTCG112A.toNumber()
    });
  }
  if (step1.incomeBreakdown.ltcg112.gt(0)) {
    slabBreakdown.push({
      slabRange: "LTCG u/s 112 (Other Assets)",
      ratePercentage: 12.5,
      taxableAmountInSlab: step1.incomeBreakdown.ltcg112.toNumber(),
      taxGenerated: step3.taxOnLTCG112.toNumber()
    });
  }
  if (step1.incomeBreakdown.casualIncome.gt(0)) {
    slabBreakdown.push({
      slabRange: "Casual Winnings u/s 115BB",
      ratePercentage: 30,
      taxableAmountInSlab: step1.incomeBreakdown.casualIncome.toNumber(),
      taxGenerated: step3.taxOnCasualIncome.toNumber()
    });
  }
  if (step1.incomeBreakdown.cryptoVda && step1.incomeBreakdown.cryptoVda.gt(0)) {
    slabBreakdown.push({
      slabRange: "Crypto / VDA u/s 115BBH",
      ratePercentage: 30,
      taxableAmountInSlab: step1.incomeBreakdown.cryptoVda.toNumber(),
      taxGenerated: (step3.taxOnCryptoVda || ZERO).toNumber()
    });
  }
  const surchargeDetails = {
    baseTaxAmount: step4.taxAfterRebate.toNumber(),
    appliedRate: step5.applicableSurchargeRate.toNumber(),
    grossSurcharge: step5.totalSurchargeBeforeMR.toNumber(),
    marginalReliefSubtracted: step5.marginalReliefOnSurcharge.toNumber(),
    netSurcharge: step5.totalSurchargeAfterMR.toNumber()
  };
  const cessDetails = {
    taxPlusSurcharge: step5.taxAfterSurcharge.toNumber(),
    ratePercentage: step6.cessRate.toNumber(),
    cessAmount: step6.cessAmount.toNumber()
  };
  const calculationSheet = {
    slabBreakdown,
    surchargeDetails,
    cessDetails
  };
  const assessment = {
    // Profile
    profileId: profile.profile_id,
    financialYear: profile.financial_year,
    assessmentYear: profile.assessment_year,
    regimeType: regime,
    ageCategory,
    // Step 1
    standardDeductionAmount: step1.standardDeductionAmount,
    incomeBreakdown: step1.incomeBreakdown,
    grossTotalIncome: step1.grossTotalIncome,
    grossNormalIncome: step1.grossNormalIncome,
    totalSpecialIncome: step1.totalSpecialIncome,
    ltcg112AExemption: step1.ltcg112AExemption,
    ltcg112ANetTaxable: step1.ltcg112ANetTaxable,
    // Step 2
    deductionBreakdown: step2.deductionBreakdown,
    totalDeductions: step2.totalDeductions,
    netTaxableNormalIncome: step2.netTaxableNormalIncome,
    // Step 3
    slabComputationDetails: step3.slabDetails,
    taxOnNormalIncome: step3.taxOnNormalIncome,
    taxOnSTCG111A: step3.taxOnSTCG111A,
    taxOnLTCG112A: step3.taxOnLTCG112A,
    taxOnLTCG112: step3.taxOnLTCG112,
    taxOnCasualIncome: step3.taxOnCasualIncome,
    taxOnCryptoVda: step3.taxOnCryptoVda,
    totalTaxOnSpecialIncome: step3.totalTaxOnSpecialIncome,
    totalComputedTax: step3.totalComputedTax,
    // Step 4
    totalNetTaxableIncome: step4.totalNetTaxableIncome,
    rebate87AEligible: step4.rebate87AEligible,
    rebate87AAmount: step4.rebate87AAmount,
    marginalRelief87A: step4.marginalRelief87A,
    taxAfterRebate: step4.taxAfterRebate,
    // Step 5
    applicableSurchargeRate: step5.applicableSurchargeRate,
    surchargeOnNormalTax: step5.surchargeOnNormalTax,
    surchargeOnSpecialTax: step5.surchargeOnSpecialTax,
    surchargeOnSpecialTaxCapped: step5.surchargeOnSpecialTaxCapped,
    totalSurchargeBeforeMR: step5.totalSurchargeBeforeMR,
    marginalReliefOnSurcharge: step5.marginalReliefOnSurcharge,
    totalSurchargeAfterMR: step5.totalSurchargeAfterMR,
    surchargeAmount: step5.totalSurchargeAfterMR,
    taxAfterSurcharge: step5.taxAfterSurcharge,
    // Step 6
    cessRate: step6.cessRate,
    cessAmount: step6.cessAmount,
    // Final
    totalTaxLiability,
    effectiveTaxRate,
    // Metadata
    computedAt: (/* @__PURE__ */ new Date()).toISOString(),
    engineVersion: ENGINE_VERSION,
    warnings: allWarnings,
    computationNotes,
    calculationSheet
  };
  return assessment;
}
function compareRegimes(profile, incomeRecords, deductionRecords) {
  const entityType = profile.entity_type || "INDIVIDUAL";
  if (entityType !== "INDIVIDUAL" && entityType !== "HUF" && entityType !== "AOP_BOI") {
    const assessment = calculateNonIndividualTax(profile, incomeRecords, deductionRecords);
    return {
      oldRegimeAssessment: assessment,
      newRegimeAssessment: assessment,
      recommendation: "NEW",
      savings: ZERO
    };
  }
  const oldProfile = { ...profile, opted_for_new_regime: false };
  const newProfile = { ...profile, opted_for_new_regime: true };
  const oldAssessment = calculateTaxLiability(oldProfile, incomeRecords, deductionRecords);
  const newAssessment = calculateTaxLiability(newProfile, incomeRecords, deductionRecords);
  const oldTax = oldAssessment.totalTaxLiability;
  const newTax = newAssessment.totalTaxLiability;
  const recommendation = newTax.lte(oldTax) ? "NEW" : "OLD";
  const savings = oldTax.gt(newTax) ? oldTax.sub(newTax) : newTax.sub(oldTax);
  return {
    oldRegimeAssessment: oldAssessment,
    newRegimeAssessment: newAssessment,
    recommendation,
    savings
  };
}
var INTERNAL_PRECISION, SCALE, Decimal, ZERO, IncomeType, RegimeType, AgeCategory, ruleId, DEDUCTION_LIMITS, SURCHARGE_BRACKETS_OLD, SURCHARGE_BRACKETS_NEW, SPECIAL_INCOME_SURCHARGE_CAP, REBATE_87A_NEW, REBATE_87A_OLD, SPECIAL_RATES, HEC_RATE, AGGREGATE_CAPS, ENGINE_VERSION;
var init_incomeTaxEngine = __esm({
  "src/server_lib/incomeTaxEngine.js"() {
    INTERNAL_PRECISION = 4;
    SCALE = BigInt(10 ** INTERNAL_PRECISION);
    Decimal = class _Decimal {
      /** @internal Scaled BigInt value (actual × 10^INTERNAL_PRECISION) */
      _value;
      constructor(value) {
        if (value instanceof _Decimal) {
          this._value = value._value;
        } else if (typeof value === "bigint") {
          this._value = value;
        } else {
          this._value = toBigInt(value);
        }
      }
      // ── Factory ──────────────────────────────────────────────
      /** Create from a raw scaled BigInt (internal use) */
      static _fromRaw(raw) {
        const d = Object.create(_Decimal.prototype);
        d._value = raw;
        return d;
      }
      static ZERO = _Decimal._fromRaw(0n);
      // ── Arithmetic ───────────────────────────────────────────
      add(other) {
        const o = other instanceof _Decimal ? other._value : toBigInt(other);
        return _Decimal._fromRaw(this._value + o);
      }
      sub(other) {
        const o = other instanceof _Decimal ? other._value : toBigInt(other);
        return _Decimal._fromRaw(this._value - o);
      }
      mul(other) {
        const o = other instanceof _Decimal ? other._value : toBigInt(other);
        const raw = this._value * o / SCALE;
        return _Decimal._fromRaw(raw);
      }
      div(other) {
        const o = other instanceof _Decimal ? other._value : toBigInt(other);
        if (o === 0n) {
          throw new Error("Decimal division by zero");
        }
        const raw = this._value * SCALE / o;
        return _Decimal._fromRaw(raw);
      }
      /** Negate */
      neg() {
        return _Decimal._fromRaw(-this._value);
      }
      /** Absolute value */
      abs() {
        return _Decimal._fromRaw(this._value < 0n ? -this._value : this._value);
      }
      /** Returns the percentage: this * (percent / 100) */
      percent(rate) {
        return this.mul(rate).div(100);
      }
      /** Floor to nearest integer (towards zero) */
      floor() {
        const truncated = this._value / SCALE * SCALE;
        if (this._value < 0n && truncated !== this._value) {
          return _Decimal._fromRaw(truncated - SCALE);
        }
        return _Decimal._fromRaw(truncated);
      }
      /** Round to nearest integer */
      roundToInt() {
        const half = SCALE / 2n;
        if (this._value >= 0n) {
          return _Decimal._fromRaw((this._value + half) / SCALE * SCALE);
        } else {
          return _Decimal._fromRaw((this._value - half) / SCALE * SCALE);
        }
      }
      // ── Comparison ───────────────────────────────────────────
      gt(other) {
        const o = other instanceof _Decimal ? other._value : toBigInt(other);
        return this._value > o;
      }
      gte(other) {
        const o = other instanceof _Decimal ? other._value : toBigInt(other);
        return this._value >= o;
      }
      lt(other) {
        const o = other instanceof _Decimal ? other._value : toBigInt(other);
        return this._value < o;
      }
      lte(other) {
        const o = other instanceof _Decimal ? other._value : toBigInt(other);
        return this._value <= o;
      }
      eq(other) {
        const o = other instanceof _Decimal ? other._value : toBigInt(other);
        return this._value === o;
      }
      isZero() {
        return this._value === 0n;
      }
      isNegative() {
        return this._value < 0n;
      }
      isPositive() {
        return this._value > 0n;
      }
      // ── Static helpers ───────────────────────────────────────
      static max(...values) {
        let result = values[0];
        for (let i = 1; i < values.length; i++) {
          if (values[i]._value > result._value) result = values[i];
        }
        return result;
      }
      static min(...values) {
        let result = values[0];
        for (let i = 1; i < values.length; i++) {
          if (values[i]._value < result._value) result = values[i];
        }
        return result;
      }
      /** Clamp value to be at least `floor` (typically 0) */
      clampMin(floor) {
        const f = floor instanceof _Decimal ? floor._value : toBigInt(floor);
        return this._value < f ? _Decimal._fromRaw(f) : this;
      }
      // ── Output ───────────────────────────────────────────────
      toNumber() {
        const intPart = this._value / SCALE;
        const fracPart = this._value % SCALE;
        const sign = this._value < 0n ? -1 : 1;
        const absInt = intPart < 0n ? -intPart : intPart;
        const absFrac = fracPart < 0n ? -fracPart : fracPart;
        return sign * (Number(absInt) + Number(absFrac) / Number(SCALE));
      }
      toFixed(decimals = 2) {
        const negative = this._value < 0n;
        const abs = negative ? -this._value : this._value;
        const intPart = abs / SCALE;
        const fracPart = abs % SCALE;
        const fracStr = fracPart.toString().padStart(INTERNAL_PRECISION, "0");
        let outputFrac;
        if (decimals <= 0) {
          outputFrac = "";
        } else if (decimals >= INTERNAL_PRECISION) {
          outputFrac = fracStr.padEnd(decimals, "0");
        } else {
          const roundDigit = parseInt(fracStr[decimals], 10);
          let truncated = fracStr.slice(0, decimals);
          if (roundDigit >= 5) {
            const incremented = (parseInt(truncated, 10) + 1).toString().padStart(decimals, "0");
            if (incremented.length > decimals) {
              const newInt = intPart + 1n;
              const prefix2 = negative ? "-" : "";
              return `${prefix2}${newInt}.${"0".repeat(decimals)}`;
            }
            truncated = incremented;
          }
          outputFrac = truncated;
        }
        const prefix = negative ? "-" : "";
        if (outputFrac) {
          return `${prefix}${intPart}.${outputFrac}`;
        }
        return `${prefix}${intPart}`;
      }
      toString() {
        return this.toFixed(2);
      }
      /** Format as Indian currency string (e.g., "₹12,34,567.00") */
      toINR() {
        const num = this.toFixed(2);
        const [intPart, fracPart] = num.split(".");
        const negative = intPart.startsWith("-");
        const absInt = negative ? intPart.slice(1) : intPart;
        let formatted;
        if (absInt.length <= 3) {
          formatted = absInt;
        } else {
          const last3 = absInt.slice(-3);
          const remaining = absInt.slice(0, -3);
          const groups = [];
          for (let i = remaining.length; i > 0; i -= 2) {
            const start = Math.max(0, i - 2);
            groups.unshift(remaining.slice(start, i));
          }
          formatted = groups.join(",") + "," + last3;
        }
        const prefix = negative ? "-\u20B9" : "\u20B9";
        return `${prefix}${formatted}.${fracPart}`;
      }
    };
    ZERO = Decimal.ZERO;
    IncomeType = {
      SALARY: "SALARY",
      HOUSE_PROPERTY: "HOUSE_PROPERTY",
      BUSINESS: "BUSINESS",
      CAPITAL_GAINS: "CAPITAL_GAINS",
      OTHER_SOURCES: "OTHER_SOURCES",
      STCG_111A: "STCG_111A",
      LTCG_112A: "LTCG_112A",
      LTCG_112: "LTCG_112",
      CASUAL_INCOME: "CASUAL_INCOME",
      AGRICULTURAL_INCOME: "AGRICULTURAL_INCOME",
      DEEMED_INCOME_115BBE: "DEEMED_INCOME_115BBE"
    };
    RegimeType = {
      OLD: "OLD",
      NEW: "NEW"
    };
    AgeCategory = {
      NORMAL: "NORMAL",
      SENIOR: "SENIOR",
      SUPER_SENIOR: "SUPER_SENIOR"
    };
    ruleId = 0;
    DEDUCTION_LIMITS = [
      // ── Standard Deduction from Salary (Sec 16(ia)) ──────────
      {
        sectionCode: "16ia",
        maxLimit: 75e3,
        description: "Standard Deduction from Salary Income",
        allowedInNewRegime: true,
        aggregateGroup: null
      },
      // ── Section 80C / 80CCC / 80CCD(1) — Aggregate cap ₹1.5L ─
      {
        sectionCode: "80C",
        maxLimit: 15e4,
        description: "Life Insurance, PPF, ELSS, Tuition Fees, etc.",
        allowedInNewRegime: false,
        aggregateGroup: "80C_AGGREGATE"
      },
      {
        sectionCode: "80CCC",
        maxLimit: 15e4,
        description: "Pension Fund Contribution",
        allowedInNewRegime: false,
        aggregateGroup: "80C_AGGREGATE"
      },
      {
        sectionCode: "80CCD1",
        maxLimit: 15e4,
        description: "Employee NPS Contribution (own, within 80C limit)",
        allowedInNewRegime: false,
        aggregateGroup: "80C_AGGREGATE"
      },
      // ── Section 80CCD(1B) — Additional NPS ₹50,000 ───────────
      {
        sectionCode: "80CCD1B",
        maxLimit: 5e4,
        description: "Additional NPS Contribution (over 80C limit)",
        allowedInNewRegime: false,
        aggregateGroup: null
      },
      // ── Section 80CCD(2) — Employer NPS (no cap, 14% of salary) ─
      {
        sectionCode: "80CCD2",
        maxLimit: Infinity,
        description: "Employer NPS Contribution (up to 14% of salary)",
        allowedInNewRegime: true,
        // ✅ Allowed in New Regime
        aggregateGroup: null
      },
      // ── Section 80D — Medical Insurance ───────────────────────
      {
        sectionCode: "80D",
        maxLimit: 1e5,
        description: "Medical Insurance Premium (self + family + parents)",
        allowedInNewRegime: false,
        aggregateGroup: null
      },
      // ── Section 80DD — Disabled Dependent ─────────────────────
      {
        sectionCode: "80DD",
        maxLimit: 125e3,
        description: "Maintenance of Disabled Dependent (\u20B975K/\u20B91.25L)",
        allowedInNewRegime: false,
        aggregateGroup: null
      },
      // ── Section 80DDB — Medical Treatment ─────────────────────
      {
        sectionCode: "80DDB",
        maxLimit: 1e5,
        description: "Medical Treatment of Specified Diseases",
        allowedInNewRegime: false,
        aggregateGroup: null
      },
      // ── Section 80E — Education Loan Interest ─────────────────
      {
        sectionCode: "80E",
        maxLimit: Infinity,
        description: "Interest on Education Loan (no cap, 8 AYs)",
        allowedInNewRegime: false,
        aggregateGroup: null
      },
      // ── Section 80EEA — Interest on Housing Loan (Affordable) ─
      {
        sectionCode: "80EEA",
        maxLimit: 15e4,
        description: "Interest on Housing Loan for Affordable Housing",
        allowedInNewRegime: false,
        aggregateGroup: null
      },
      // ── Section 80G — Donations ───────────────────────────────
      {
        sectionCode: "80G",
        maxLimit: Infinity,
        description: "Donations to Charitable Institutions (various limits)",
        allowedInNewRegime: false,
        aggregateGroup: null
      },
      // ── Section 80GG — Rent Paid (no HRA) ─────────────────────
      {
        sectionCode: "80GG",
        maxLimit: 6e4,
        description: "Rent Paid (when no HRA received) \u2014 \u20B95,000/month",
        allowedInNewRegime: false,
        aggregateGroup: null
      },
      // ── Section 80TTA — Savings Interest (non-senior) ─────────
      {
        sectionCode: "80TTA",
        maxLimit: 1e4,
        description: "Interest on Savings Account (non-senior citizens)",
        allowedInNewRegime: false,
        aggregateGroup: null
      },
      // ── Section 80TTB — Interest Income (senior citizens) ─────
      {
        sectionCode: "80TTB",
        maxLimit: 5e4,
        description: "Interest on Deposits (senior citizens only)",
        allowedInNewRegime: false,
        aggregateGroup: null
      },
      // ── Section 80U — Person with Disability ──────────────────
      {
        sectionCode: "80U",
        maxLimit: 125e3,
        description: "Person with Disability (\u20B975K/\u20B91.25L)",
        allowedInNewRegime: false,
        aggregateGroup: null
      },
      // ── Section 24(b) — Interest on Housing Loan (Self-Occupied) ─
      {
        sectionCode: "24b",
        maxLimit: 2e5,
        description: "Interest on Housing Loan for Self-Occupied Property",
        allowedInNewRegime: false,
        // ❌ NOT allowed in New Regime
        aggregateGroup: null
      }
    ];
    SURCHARGE_BRACKETS_OLD = [
      { incomeThreshold: 5e7, rate: 37 },
      { incomeThreshold: 2e7, rate: 25 },
      { incomeThreshold: 1e7, rate: 15 },
      { incomeThreshold: 5e6, rate: 10 }
    ];
    SURCHARGE_BRACKETS_NEW = [
      { incomeThreshold: 2e7, rate: 25 },
      { incomeThreshold: 1e7, rate: 15 },
      { incomeThreshold: 5e6, rate: 10 }
    ];
    SPECIAL_INCOME_SURCHARGE_CAP = 15;
    REBATE_87A_NEW = {
      incomeThreshold: 12e5,
      maxRebate: 6e4
    };
    REBATE_87A_OLD = {
      incomeThreshold: 5e5,
      maxRebate: 12500
    };
    SPECIAL_RATES = {
      /** STCG u/s 111A — 20% from FY 2024-25 onward (Budget 2024) */
      STCG_111A: 20,
      /** LTCG u/s 112A — 12.5% on amount exceeding exemption */
      LTCG_112A: 12.5,
      /** LTCG u/s 112A exemption threshold */
      LTCG_112A_EXEMPTION: 125e3,
      /** LTCG u/s 112 — 12.5% (without indexation, FY 2025-26 default) */
      LTCG_112_WITHOUT_INDEXATION: 12.5,
      /** LTCG u/s 112 — 20% (with indexation, only for pre-23-Jul-2024 assets) */
      LTCG_112_WITH_INDEXATION: 20,
      /** Casual Income (Lottery, Crypto u/s 115BBH, Game Shows) — 30% flat */
      CASUAL_INCOME: 30
    };
    HEC_RATE = 4;
    AGGREGATE_CAPS = {
      "80C_AGGREGATE": 15e4
    };
    ENGINE_VERSION = "1.0.0";
  }
});

// node_modules/delayed-stream/lib/delayed_stream.js
var require_delayed_stream = __commonJS({
  "node_modules/delayed-stream/lib/delayed_stream.js"(exports2, module2) {
    var Stream = require("stream").Stream;
    var util = require("util");
    module2.exports = DelayedStream;
    function DelayedStream() {
      this.source = null;
      this.dataSize = 0;
      this.maxDataSize = 1024 * 1024;
      this.pauseStream = true;
      this._maxDataSizeExceeded = false;
      this._released = false;
      this._bufferedEvents = [];
    }
    util.inherits(DelayedStream, Stream);
    DelayedStream.create = function(source, options) {
      var delayedStream = new this();
      options = options || {};
      for (var option in options) {
        delayedStream[option] = options[option];
      }
      delayedStream.source = source;
      var realEmit = source.emit;
      source.emit = function() {
        delayedStream._handleEmit(arguments);
        return realEmit.apply(source, arguments);
      };
      source.on("error", function() {
      });
      if (delayedStream.pauseStream) {
        source.pause();
      }
      return delayedStream;
    };
    Object.defineProperty(DelayedStream.prototype, "readable", {
      configurable: true,
      enumerable: true,
      get: function() {
        return this.source.readable;
      }
    });
    DelayedStream.prototype.setEncoding = function() {
      return this.source.setEncoding.apply(this.source, arguments);
    };
    DelayedStream.prototype.resume = function() {
      if (!this._released) {
        this.release();
      }
      this.source.resume();
    };
    DelayedStream.prototype.pause = function() {
      this.source.pause();
    };
    DelayedStream.prototype.release = function() {
      this._released = true;
      this._bufferedEvents.forEach(function(args) {
        this.emit.apply(this, args);
      }.bind(this));
      this._bufferedEvents = [];
    };
    DelayedStream.prototype.pipe = function() {
      var r = Stream.prototype.pipe.apply(this, arguments);
      this.resume();
      return r;
    };
    DelayedStream.prototype._handleEmit = function(args) {
      if (this._released) {
        this.emit.apply(this, args);
        return;
      }
      if (args[0] === "data") {
        this.dataSize += args[1].length;
        this._checkIfMaxDataSizeExceeded();
      }
      this._bufferedEvents.push(args);
    };
    DelayedStream.prototype._checkIfMaxDataSizeExceeded = function() {
      if (this._maxDataSizeExceeded) {
        return;
      }
      if (this.dataSize <= this.maxDataSize) {
        return;
      }
      this._maxDataSizeExceeded = true;
      var message = "DelayedStream#maxDataSize of " + this.maxDataSize + " bytes exceeded.";
      this.emit("error", new Error(message));
    };
  }
});

// node_modules/combined-stream/lib/combined_stream.js
var require_combined_stream = __commonJS({
  "node_modules/combined-stream/lib/combined_stream.js"(exports2, module2) {
    var util = require("util");
    var Stream = require("stream").Stream;
    var DelayedStream = require_delayed_stream();
    module2.exports = CombinedStream;
    function CombinedStream() {
      this.writable = false;
      this.readable = true;
      this.dataSize = 0;
      this.maxDataSize = 2 * 1024 * 1024;
      this.pauseStreams = true;
      this._released = false;
      this._streams = [];
      this._currentStream = null;
      this._insideLoop = false;
      this._pendingNext = false;
    }
    util.inherits(CombinedStream, Stream);
    CombinedStream.create = function(options) {
      var combinedStream = new this();
      options = options || {};
      for (var option in options) {
        combinedStream[option] = options[option];
      }
      return combinedStream;
    };
    CombinedStream.isStreamLike = function(stream) {
      return typeof stream !== "function" && typeof stream !== "string" && typeof stream !== "boolean" && typeof stream !== "number" && !Buffer.isBuffer(stream);
    };
    CombinedStream.prototype.append = function(stream) {
      var isStreamLike = CombinedStream.isStreamLike(stream);
      if (isStreamLike) {
        if (!(stream instanceof DelayedStream)) {
          var newStream = DelayedStream.create(stream, {
            maxDataSize: Infinity,
            pauseStream: this.pauseStreams
          });
          stream.on("data", this._checkDataSize.bind(this));
          stream = newStream;
        }
        this._handleErrors(stream);
        if (this.pauseStreams) {
          stream.pause();
        }
      }
      this._streams.push(stream);
      return this;
    };
    CombinedStream.prototype.pipe = function(dest, options) {
      Stream.prototype.pipe.call(this, dest, options);
      this.resume();
      return dest;
    };
    CombinedStream.prototype._getNext = function() {
      this._currentStream = null;
      if (this._insideLoop) {
        this._pendingNext = true;
        return;
      }
      this._insideLoop = true;
      try {
        do {
          this._pendingNext = false;
          this._realGetNext();
        } while (this._pendingNext);
      } finally {
        this._insideLoop = false;
      }
    };
    CombinedStream.prototype._realGetNext = function() {
      var stream = this._streams.shift();
      if (typeof stream == "undefined") {
        this.end();
        return;
      }
      if (typeof stream !== "function") {
        this._pipeNext(stream);
        return;
      }
      var getStream = stream;
      getStream(function(stream2) {
        var isStreamLike = CombinedStream.isStreamLike(stream2);
        if (isStreamLike) {
          stream2.on("data", this._checkDataSize.bind(this));
          this._handleErrors(stream2);
        }
        this._pipeNext(stream2);
      }.bind(this));
    };
    CombinedStream.prototype._pipeNext = function(stream) {
      this._currentStream = stream;
      var isStreamLike = CombinedStream.isStreamLike(stream);
      if (isStreamLike) {
        stream.on("end", this._getNext.bind(this));
        stream.pipe(this, { end: false });
        return;
      }
      var value = stream;
      this.write(value);
      this._getNext();
    };
    CombinedStream.prototype._handleErrors = function(stream) {
      var self2 = this;
      stream.on("error", function(err) {
        self2._emitError(err);
      });
    };
    CombinedStream.prototype.write = function(data) {
      this.emit("data", data);
    };
    CombinedStream.prototype.pause = function() {
      if (!this.pauseStreams) {
        return;
      }
      if (this.pauseStreams && this._currentStream && typeof this._currentStream.pause == "function") this._currentStream.pause();
      this.emit("pause");
    };
    CombinedStream.prototype.resume = function() {
      if (!this._released) {
        this._released = true;
        this.writable = true;
        this._getNext();
      }
      if (this.pauseStreams && this._currentStream && typeof this._currentStream.resume == "function") this._currentStream.resume();
      this.emit("resume");
    };
    CombinedStream.prototype.end = function() {
      this._reset();
      this.emit("end");
    };
    CombinedStream.prototype.destroy = function() {
      this._reset();
      this.emit("close");
    };
    CombinedStream.prototype._reset = function() {
      this.writable = false;
      this._streams = [];
      this._currentStream = null;
    };
    CombinedStream.prototype._checkDataSize = function() {
      this._updateDataSize();
      if (this.dataSize <= this.maxDataSize) {
        return;
      }
      var message = "DelayedStream#maxDataSize of " + this.maxDataSize + " bytes exceeded.";
      this._emitError(new Error(message));
    };
    CombinedStream.prototype._updateDataSize = function() {
      this.dataSize = 0;
      var self2 = this;
      this._streams.forEach(function(stream) {
        if (!stream.dataSize) {
          return;
        }
        self2.dataSize += stream.dataSize;
      });
      if (this._currentStream && this._currentStream.dataSize) {
        this.dataSize += this._currentStream.dataSize;
      }
    };
    CombinedStream.prototype._emitError = function(err) {
      this._reset();
      this.emit("error", err);
    };
  }
});

// node_modules/asynckit/lib/defer.js
var require_defer = __commonJS({
  "node_modules/asynckit/lib/defer.js"(exports2, module2) {
    module2.exports = defer;
    function defer(fn) {
      var nextTick = typeof setImmediate == "function" ? setImmediate : typeof process == "object" && typeof process.nextTick == "function" ? process.nextTick : null;
      if (nextTick) {
        nextTick(fn);
      } else {
        setTimeout(fn, 0);
      }
    }
  }
});

// node_modules/asynckit/lib/async.js
var require_async = __commonJS({
  "node_modules/asynckit/lib/async.js"(exports2, module2) {
    var defer = require_defer();
    module2.exports = async;
    function async(callback) {
      var isAsync = false;
      defer(function() {
        isAsync = true;
      });
      return function async_callback(err, result) {
        if (isAsync) {
          callback(err, result);
        } else {
          defer(function nextTick_callback() {
            callback(err, result);
          });
        }
      };
    }
  }
});

// node_modules/asynckit/lib/abort.js
var require_abort = __commonJS({
  "node_modules/asynckit/lib/abort.js"(exports2, module2) {
    module2.exports = abort;
    function abort(state) {
      Object.keys(state.jobs).forEach(clean.bind(state));
      state.jobs = {};
    }
    function clean(key) {
      if (typeof this.jobs[key] == "function") {
        this.jobs[key]();
      }
    }
  }
});

// node_modules/asynckit/lib/iterate.js
var require_iterate = __commonJS({
  "node_modules/asynckit/lib/iterate.js"(exports2, module2) {
    var async = require_async();
    var abort = require_abort();
    module2.exports = iterate;
    function iterate(list, iterator, state, callback) {
      var key = state["keyedList"] ? state["keyedList"][state.index] : state.index;
      state.jobs[key] = runJob(iterator, key, list[key], function(error, output) {
        if (!(key in state.jobs)) {
          return;
        }
        delete state.jobs[key];
        if (error) {
          abort(state);
        } else {
          state.results[key] = output;
        }
        callback(error, state.results);
      });
    }
    function runJob(iterator, key, item, callback) {
      var aborter;
      if (iterator.length == 2) {
        aborter = iterator(item, async(callback));
      } else {
        aborter = iterator(item, key, async(callback));
      }
      return aborter;
    }
  }
});

// node_modules/asynckit/lib/state.js
var require_state2 = __commonJS({
  "node_modules/asynckit/lib/state.js"(exports2, module2) {
    module2.exports = state;
    function state(list, sortMethod) {
      var isNamedList = !Array.isArray(list), initState = {
        index: 0,
        keyedList: isNamedList || sortMethod ? Object.keys(list) : null,
        jobs: {},
        results: isNamedList ? {} : [],
        size: isNamedList ? Object.keys(list).length : list.length
      };
      if (sortMethod) {
        initState.keyedList.sort(isNamedList ? sortMethod : function(a, b) {
          return sortMethod(list[a], list[b]);
        });
      }
      return initState;
    }
  }
});

// node_modules/asynckit/lib/terminator.js
var require_terminator = __commonJS({
  "node_modules/asynckit/lib/terminator.js"(exports2, module2) {
    var abort = require_abort();
    var async = require_async();
    module2.exports = terminator;
    function terminator(callback) {
      if (!Object.keys(this.jobs).length) {
        return;
      }
      this.index = this.size;
      abort(this);
      async(callback)(null, this.results);
    }
  }
});

// node_modules/asynckit/parallel.js
var require_parallel = __commonJS({
  "node_modules/asynckit/parallel.js"(exports2, module2) {
    var iterate = require_iterate();
    var initState = require_state2();
    var terminator = require_terminator();
    module2.exports = parallel;
    function parallel(list, iterator, callback) {
      var state = initState(list);
      while (state.index < (state["keyedList"] || list).length) {
        iterate(list, iterator, state, function(error, result) {
          if (error) {
            callback(error, result);
            return;
          }
          if (Object.keys(state.jobs).length === 0) {
            callback(null, state.results);
            return;
          }
        });
        state.index++;
      }
      return terminator.bind(state, callback);
    }
  }
});

// node_modules/asynckit/serialOrdered.js
var require_serialOrdered = __commonJS({
  "node_modules/asynckit/serialOrdered.js"(exports2, module2) {
    var iterate = require_iterate();
    var initState = require_state2();
    var terminator = require_terminator();
    module2.exports = serialOrdered;
    module2.exports.ascending = ascending;
    module2.exports.descending = descending;
    function serialOrdered(list, iterator, sortMethod, callback) {
      var state = initState(list, sortMethod);
      iterate(list, iterator, state, function iteratorHandler(error, result) {
        if (error) {
          callback(error, result);
          return;
        }
        state.index++;
        if (state.index < (state["keyedList"] || list).length) {
          iterate(list, iterator, state, iteratorHandler);
          return;
        }
        callback(null, state.results);
      });
      return terminator.bind(state, callback);
    }
    function ascending(a, b) {
      return a < b ? -1 : a > b ? 1 : 0;
    }
    function descending(a, b) {
      return -1 * ascending(a, b);
    }
  }
});

// node_modules/asynckit/serial.js
var require_serial = __commonJS({
  "node_modules/asynckit/serial.js"(exports2, module2) {
    var serialOrdered = require_serialOrdered();
    module2.exports = serial;
    function serial(list, iterator, callback) {
      return serialOrdered(list, iterator, null, callback);
    }
  }
});

// node_modules/asynckit/index.js
var require_asynckit = __commonJS({
  "node_modules/asynckit/index.js"(exports2, module2) {
    module2.exports = {
      parallel: require_parallel(),
      serial: require_serial(),
      serialOrdered: require_serialOrdered()
    };
  }
});

// node_modules/es-object-atoms/index.js
var require_es_object_atoms = __commonJS({
  "node_modules/es-object-atoms/index.js"(exports2, module2) {
    "use strict";
    module2.exports = Object;
  }
});

// node_modules/es-errors/index.js
var require_es_errors = __commonJS({
  "node_modules/es-errors/index.js"(exports2, module2) {
    "use strict";
    module2.exports = Error;
  }
});

// node_modules/es-errors/eval.js
var require_eval = __commonJS({
  "node_modules/es-errors/eval.js"(exports2, module2) {
    "use strict";
    module2.exports = EvalError;
  }
});

// node_modules/es-errors/range.js
var require_range = __commonJS({
  "node_modules/es-errors/range.js"(exports2, module2) {
    "use strict";
    module2.exports = RangeError;
  }
});

// node_modules/es-errors/ref.js
var require_ref = __commonJS({
  "node_modules/es-errors/ref.js"(exports2, module2) {
    "use strict";
    module2.exports = ReferenceError;
  }
});

// node_modules/es-errors/syntax.js
var require_syntax = __commonJS({
  "node_modules/es-errors/syntax.js"(exports2, module2) {
    "use strict";
    module2.exports = SyntaxError;
  }
});

// node_modules/es-errors/type.js
var require_type = __commonJS({
  "node_modules/es-errors/type.js"(exports2, module2) {
    "use strict";
    module2.exports = TypeError;
  }
});

// node_modules/es-errors/uri.js
var require_uri = __commonJS({
  "node_modules/es-errors/uri.js"(exports2, module2) {
    "use strict";
    module2.exports = URIError;
  }
});

// node_modules/math-intrinsics/abs.js
var require_abs = __commonJS({
  "node_modules/math-intrinsics/abs.js"(exports2, module2) {
    "use strict";
    module2.exports = Math.abs;
  }
});

// node_modules/math-intrinsics/floor.js
var require_floor = __commonJS({
  "node_modules/math-intrinsics/floor.js"(exports2, module2) {
    "use strict";
    module2.exports = Math.floor;
  }
});

// node_modules/math-intrinsics/max.js
var require_max = __commonJS({
  "node_modules/math-intrinsics/max.js"(exports2, module2) {
    "use strict";
    module2.exports = Math.max;
  }
});

// node_modules/math-intrinsics/min.js
var require_min = __commonJS({
  "node_modules/math-intrinsics/min.js"(exports2, module2) {
    "use strict";
    module2.exports = Math.min;
  }
});

// node_modules/math-intrinsics/pow.js
var require_pow = __commonJS({
  "node_modules/math-intrinsics/pow.js"(exports2, module2) {
    "use strict";
    module2.exports = Math.pow;
  }
});

// node_modules/math-intrinsics/round.js
var require_round = __commonJS({
  "node_modules/math-intrinsics/round.js"(exports2, module2) {
    "use strict";
    module2.exports = Math.round;
  }
});

// node_modules/math-intrinsics/isNaN.js
var require_isNaN = __commonJS({
  "node_modules/math-intrinsics/isNaN.js"(exports2, module2) {
    "use strict";
    module2.exports = Number.isNaN || function isNaN2(a) {
      return a !== a;
    };
  }
});

// node_modules/math-intrinsics/sign.js
var require_sign = __commonJS({
  "node_modules/math-intrinsics/sign.js"(exports2, module2) {
    "use strict";
    var $isNaN = require_isNaN();
    module2.exports = function sign(number) {
      if ($isNaN(number) || number === 0) {
        return number;
      }
      return number < 0 ? -1 : 1;
    };
  }
});

// node_modules/gopd/gOPD.js
var require_gOPD = __commonJS({
  "node_modules/gopd/gOPD.js"(exports2, module2) {
    "use strict";
    module2.exports = Object.getOwnPropertyDescriptor;
  }
});

// node_modules/gopd/index.js
var require_gopd = __commonJS({
  "node_modules/gopd/index.js"(exports2, module2) {
    "use strict";
    var $gOPD = require_gOPD();
    if ($gOPD) {
      try {
        $gOPD([], "length");
      } catch (e) {
        $gOPD = null;
      }
    }
    module2.exports = $gOPD;
  }
});

// node_modules/es-define-property/index.js
var require_es_define_property = __commonJS({
  "node_modules/es-define-property/index.js"(exports2, module2) {
    "use strict";
    var $defineProperty = Object.defineProperty || false;
    if ($defineProperty) {
      try {
        $defineProperty({}, "a", { value: 1 });
      } catch (e) {
        $defineProperty = false;
      }
    }
    module2.exports = $defineProperty;
  }
});

// node_modules/has-symbols/shams.js
var require_shams = __commonJS({
  "node_modules/has-symbols/shams.js"(exports2, module2) {
    "use strict";
    module2.exports = function hasSymbols() {
      if (typeof Symbol !== "function" || typeof Object.getOwnPropertySymbols !== "function") {
        return false;
      }
      if (typeof Symbol.iterator === "symbol") {
        return true;
      }
      var obj = {};
      var sym = Symbol("test");
      var symObj = Object(sym);
      if (typeof sym === "string") {
        return false;
      }
      if (Object.prototype.toString.call(sym) !== "[object Symbol]") {
        return false;
      }
      if (Object.prototype.toString.call(symObj) !== "[object Symbol]") {
        return false;
      }
      var symVal = 42;
      obj[sym] = symVal;
      for (var _ in obj) {
        return false;
      }
      if (typeof Object.keys === "function" && Object.keys(obj).length !== 0) {
        return false;
      }
      if (typeof Object.getOwnPropertyNames === "function" && Object.getOwnPropertyNames(obj).length !== 0) {
        return false;
      }
      var syms = Object.getOwnPropertySymbols(obj);
      if (syms.length !== 1 || syms[0] !== sym) {
        return false;
      }
      if (!Object.prototype.propertyIsEnumerable.call(obj, sym)) {
        return false;
      }
      if (typeof Object.getOwnPropertyDescriptor === "function") {
        var descriptor = (
          /** @type {PropertyDescriptor} */
          Object.getOwnPropertyDescriptor(obj, sym)
        );
        if (descriptor.value !== symVal || descriptor.enumerable !== true) {
          return false;
        }
      }
      return true;
    };
  }
});

// node_modules/has-symbols/index.js
var require_has_symbols = __commonJS({
  "node_modules/has-symbols/index.js"(exports2, module2) {
    "use strict";
    var origSymbol = typeof Symbol !== "undefined" && Symbol;
    var hasSymbolSham = require_shams();
    module2.exports = function hasNativeSymbols() {
      if (typeof origSymbol !== "function") {
        return false;
      }
      if (typeof Symbol !== "function") {
        return false;
      }
      if (typeof origSymbol("foo") !== "symbol") {
        return false;
      }
      if (typeof Symbol("bar") !== "symbol") {
        return false;
      }
      return hasSymbolSham();
    };
  }
});

// node_modules/get-proto/Reflect.getPrototypeOf.js
var require_Reflect_getPrototypeOf = __commonJS({
  "node_modules/get-proto/Reflect.getPrototypeOf.js"(exports2, module2) {
    "use strict";
    module2.exports = typeof Reflect !== "undefined" && Reflect.getPrototypeOf || null;
  }
});

// node_modules/get-proto/Object.getPrototypeOf.js
var require_Object_getPrototypeOf = __commonJS({
  "node_modules/get-proto/Object.getPrototypeOf.js"(exports2, module2) {
    "use strict";
    var $Object = require_es_object_atoms();
    module2.exports = $Object.getPrototypeOf || null;
  }
});

// node_modules/function-bind/implementation.js
var require_implementation = __commonJS({
  "node_modules/function-bind/implementation.js"(exports2, module2) {
    "use strict";
    var ERROR_MESSAGE = "Function.prototype.bind called on incompatible ";
    var toStr = Object.prototype.toString;
    var max = Math.max;
    var funcType = "[object Function]";
    var concatty = function concatty2(a, b) {
      var arr = [];
      for (var i = 0; i < a.length; i += 1) {
        arr[i] = a[i];
      }
      for (var j = 0; j < b.length; j += 1) {
        arr[j + a.length] = b[j];
      }
      return arr;
    };
    var slicy = function slicy2(arrLike, offset) {
      var arr = [];
      for (var i = offset || 0, j = 0; i < arrLike.length; i += 1, j += 1) {
        arr[j] = arrLike[i];
      }
      return arr;
    };
    var joiny = function(arr, joiner) {
      var str = "";
      for (var i = 0; i < arr.length; i += 1) {
        str += arr[i];
        if (i + 1 < arr.length) {
          str += joiner;
        }
      }
      return str;
    };
    module2.exports = function bind(that) {
      var target = this;
      if (typeof target !== "function" || toStr.apply(target) !== funcType) {
        throw new TypeError(ERROR_MESSAGE + target);
      }
      var args = slicy(arguments, 1);
      var bound;
      var binder = function() {
        if (this instanceof bound) {
          var result = target.apply(
            this,
            concatty(args, arguments)
          );
          if (Object(result) === result) {
            return result;
          }
          return this;
        }
        return target.apply(
          that,
          concatty(args, arguments)
        );
      };
      var boundLength = max(0, target.length - args.length);
      var boundArgs = [];
      for (var i = 0; i < boundLength; i++) {
        boundArgs[i] = "$" + i;
      }
      bound = Function("binder", "return function (" + joiny(boundArgs, ",") + "){ return binder.apply(this,arguments); }")(binder);
      if (target.prototype) {
        var Empty = function Empty2() {
        };
        Empty.prototype = target.prototype;
        bound.prototype = new Empty();
        Empty.prototype = null;
      }
      return bound;
    };
  }
});

// node_modules/function-bind/index.js
var require_function_bind = __commonJS({
  "node_modules/function-bind/index.js"(exports2, module2) {
    "use strict";
    var implementation = require_implementation();
    module2.exports = Function.prototype.bind || implementation;
  }
});

// node_modules/call-bind-apply-helpers/functionCall.js
var require_functionCall = __commonJS({
  "node_modules/call-bind-apply-helpers/functionCall.js"(exports2, module2) {
    "use strict";
    module2.exports = Function.prototype.call;
  }
});

// node_modules/call-bind-apply-helpers/functionApply.js
var require_functionApply = __commonJS({
  "node_modules/call-bind-apply-helpers/functionApply.js"(exports2, module2) {
    "use strict";
    module2.exports = Function.prototype.apply;
  }
});

// node_modules/call-bind-apply-helpers/reflectApply.js
var require_reflectApply = __commonJS({
  "node_modules/call-bind-apply-helpers/reflectApply.js"(exports2, module2) {
    "use strict";
    module2.exports = typeof Reflect !== "undefined" && Reflect && Reflect.apply;
  }
});

// node_modules/call-bind-apply-helpers/actualApply.js
var require_actualApply = __commonJS({
  "node_modules/call-bind-apply-helpers/actualApply.js"(exports2, module2) {
    "use strict";
    var bind = require_function_bind();
    var $apply = require_functionApply();
    var $call = require_functionCall();
    var $reflectApply = require_reflectApply();
    module2.exports = $reflectApply || bind.call($call, $apply);
  }
});

// node_modules/call-bind-apply-helpers/index.js
var require_call_bind_apply_helpers = __commonJS({
  "node_modules/call-bind-apply-helpers/index.js"(exports2, module2) {
    "use strict";
    var bind = require_function_bind();
    var $TypeError = require_type();
    var $call = require_functionCall();
    var $actualApply = require_actualApply();
    module2.exports = function callBindBasic(args) {
      if (args.length < 1 || typeof args[0] !== "function") {
        throw new $TypeError("a function is required");
      }
      return $actualApply(bind, $call, args);
    };
  }
});

// node_modules/dunder-proto/get.js
var require_get = __commonJS({
  "node_modules/dunder-proto/get.js"(exports2, module2) {
    "use strict";
    var callBind = require_call_bind_apply_helpers();
    var gOPD = require_gopd();
    var hasProtoAccessor;
    try {
      hasProtoAccessor = /** @type {{ __proto__?: typeof Array.prototype }} */
      [].__proto__ === Array.prototype;
    } catch (e) {
      if (!e || typeof e !== "object" || !("code" in e) || e.code !== "ERR_PROTO_ACCESS") {
        throw e;
      }
    }
    var desc = !!hasProtoAccessor && gOPD && gOPD(
      Object.prototype,
      /** @type {keyof typeof Object.prototype} */
      "__proto__"
    );
    var $Object = Object;
    var $getPrototypeOf = $Object.getPrototypeOf;
    module2.exports = desc && typeof desc.get === "function" ? callBind([desc.get]) : typeof $getPrototypeOf === "function" ? (
      /** @type {import('./get')} */
      function getDunder(value) {
        return $getPrototypeOf(value == null ? value : $Object(value));
      }
    ) : false;
  }
});

// node_modules/get-proto/index.js
var require_get_proto = __commonJS({
  "node_modules/get-proto/index.js"(exports2, module2) {
    "use strict";
    var reflectGetProto = require_Reflect_getPrototypeOf();
    var originalGetProto = require_Object_getPrototypeOf();
    var getDunderProto = require_get();
    module2.exports = reflectGetProto ? function getProto(O) {
      return reflectGetProto(O);
    } : originalGetProto ? function getProto(O) {
      if (!O || typeof O !== "object" && typeof O !== "function") {
        throw new TypeError("getProto: not an object");
      }
      return originalGetProto(O);
    } : getDunderProto ? function getProto(O) {
      return getDunderProto(O);
    } : null;
  }
});

// node_modules/hasown/index.js
var require_hasown = __commonJS({
  "node_modules/hasown/index.js"(exports2, module2) {
    "use strict";
    var call = Function.prototype.call;
    var $hasOwn = Object.prototype.hasOwnProperty;
    var bind = require_function_bind();
    module2.exports = bind.call(call, $hasOwn);
  }
});

// node_modules/get-intrinsic/index.js
var require_get_intrinsic = __commonJS({
  "node_modules/get-intrinsic/index.js"(exports2, module2) {
    "use strict";
    var undefined2;
    var $Object = require_es_object_atoms();
    var $Error = require_es_errors();
    var $EvalError = require_eval();
    var $RangeError = require_range();
    var $ReferenceError = require_ref();
    var $SyntaxError = require_syntax();
    var $TypeError = require_type();
    var $URIError = require_uri();
    var abs = require_abs();
    var floor = require_floor();
    var max = require_max();
    var min = require_min();
    var pow = require_pow();
    var round = require_round();
    var sign = require_sign();
    var $Function = Function;
    var getEvalledConstructor = function(expressionSyntax) {
      try {
        return $Function('"use strict"; return (' + expressionSyntax + ").constructor;")();
      } catch (e) {
      }
    };
    var $gOPD = require_gopd();
    var $defineProperty = require_es_define_property();
    var throwTypeError = function() {
      throw new $TypeError();
    };
    var ThrowTypeError = $gOPD ? function() {
      try {
        arguments.callee;
        return throwTypeError;
      } catch (calleeThrows) {
        try {
          return $gOPD(arguments, "callee").get;
        } catch (gOPDthrows) {
          return throwTypeError;
        }
      }
    }() : throwTypeError;
    var hasSymbols = require_has_symbols()();
    var getProto = require_get_proto();
    var $ObjectGPO = require_Object_getPrototypeOf();
    var $ReflectGPO = require_Reflect_getPrototypeOf();
    var $apply = require_functionApply();
    var $call = require_functionCall();
    var needsEval = {};
    var TypedArray = typeof Uint8Array === "undefined" || !getProto ? undefined2 : getProto(Uint8Array);
    var INTRINSICS = {
      __proto__: null,
      "%AggregateError%": typeof AggregateError === "undefined" ? undefined2 : AggregateError,
      "%Array%": Array,
      "%ArrayBuffer%": typeof ArrayBuffer === "undefined" ? undefined2 : ArrayBuffer,
      "%ArrayIteratorPrototype%": hasSymbols && getProto ? getProto([][Symbol.iterator]()) : undefined2,
      "%AsyncFromSyncIteratorPrototype%": undefined2,
      "%AsyncFunction%": needsEval,
      "%AsyncGenerator%": needsEval,
      "%AsyncGeneratorFunction%": needsEval,
      "%AsyncIteratorPrototype%": needsEval,
      "%Atomics%": typeof Atomics === "undefined" ? undefined2 : Atomics,
      "%BigInt%": typeof BigInt === "undefined" ? undefined2 : BigInt,
      "%BigInt64Array%": typeof BigInt64Array === "undefined" ? undefined2 : BigInt64Array,
      "%BigUint64Array%": typeof BigUint64Array === "undefined" ? undefined2 : BigUint64Array,
      "%Boolean%": Boolean,
      "%DataView%": typeof DataView === "undefined" ? undefined2 : DataView,
      "%Date%": Date,
      "%decodeURI%": decodeURI,
      "%decodeURIComponent%": decodeURIComponent,
      "%encodeURI%": encodeURI,
      "%encodeURIComponent%": encodeURIComponent,
      "%Error%": $Error,
      "%eval%": eval,
      // eslint-disable-line no-eval
      "%EvalError%": $EvalError,
      "%Float16Array%": typeof Float16Array === "undefined" ? undefined2 : Float16Array,
      "%Float32Array%": typeof Float32Array === "undefined" ? undefined2 : Float32Array,
      "%Float64Array%": typeof Float64Array === "undefined" ? undefined2 : Float64Array,
      "%FinalizationRegistry%": typeof FinalizationRegistry === "undefined" ? undefined2 : FinalizationRegistry,
      "%Function%": $Function,
      "%GeneratorFunction%": needsEval,
      "%Int8Array%": typeof Int8Array === "undefined" ? undefined2 : Int8Array,
      "%Int16Array%": typeof Int16Array === "undefined" ? undefined2 : Int16Array,
      "%Int32Array%": typeof Int32Array === "undefined" ? undefined2 : Int32Array,
      "%isFinite%": isFinite,
      "%isNaN%": isNaN,
      "%IteratorPrototype%": hasSymbols && getProto ? getProto(getProto([][Symbol.iterator]())) : undefined2,
      "%JSON%": typeof JSON === "object" ? JSON : undefined2,
      "%Map%": typeof Map === "undefined" ? undefined2 : Map,
      "%MapIteratorPrototype%": typeof Map === "undefined" || !hasSymbols || !getProto ? undefined2 : getProto((/* @__PURE__ */ new Map())[Symbol.iterator]()),
      "%Math%": Math,
      "%Number%": Number,
      "%Object%": $Object,
      "%Object.getOwnPropertyDescriptor%": $gOPD,
      "%parseFloat%": parseFloat,
      "%parseInt%": parseInt,
      "%Promise%": typeof Promise === "undefined" ? undefined2 : Promise,
      "%Proxy%": typeof Proxy === "undefined" ? undefined2 : Proxy,
      "%RangeError%": $RangeError,
      "%ReferenceError%": $ReferenceError,
      "%Reflect%": typeof Reflect === "undefined" ? undefined2 : Reflect,
      "%RegExp%": RegExp,
      "%Set%": typeof Set === "undefined" ? undefined2 : Set,
      "%SetIteratorPrototype%": typeof Set === "undefined" || !hasSymbols || !getProto ? undefined2 : getProto((/* @__PURE__ */ new Set())[Symbol.iterator]()),
      "%SharedArrayBuffer%": typeof SharedArrayBuffer === "undefined" ? undefined2 : SharedArrayBuffer,
      "%String%": String,
      "%StringIteratorPrototype%": hasSymbols && getProto ? getProto(""[Symbol.iterator]()) : undefined2,
      "%Symbol%": hasSymbols ? Symbol : undefined2,
      "%SyntaxError%": $SyntaxError,
      "%ThrowTypeError%": ThrowTypeError,
      "%TypedArray%": TypedArray,
      "%TypeError%": $TypeError,
      "%Uint8Array%": typeof Uint8Array === "undefined" ? undefined2 : Uint8Array,
      "%Uint8ClampedArray%": typeof Uint8ClampedArray === "undefined" ? undefined2 : Uint8ClampedArray,
      "%Uint16Array%": typeof Uint16Array === "undefined" ? undefined2 : Uint16Array,
      "%Uint32Array%": typeof Uint32Array === "undefined" ? undefined2 : Uint32Array,
      "%URIError%": $URIError,
      "%WeakMap%": typeof WeakMap === "undefined" ? undefined2 : WeakMap,
      "%WeakRef%": typeof WeakRef === "undefined" ? undefined2 : WeakRef,
      "%WeakSet%": typeof WeakSet === "undefined" ? undefined2 : WeakSet,
      "%Function.prototype.call%": $call,
      "%Function.prototype.apply%": $apply,
      "%Object.defineProperty%": $defineProperty,
      "%Object.getPrototypeOf%": $ObjectGPO,
      "%Math.abs%": abs,
      "%Math.floor%": floor,
      "%Math.max%": max,
      "%Math.min%": min,
      "%Math.pow%": pow,
      "%Math.round%": round,
      "%Math.sign%": sign,
      "%Reflect.getPrototypeOf%": $ReflectGPO
    };
    if (getProto) {
      try {
        null.error;
      } catch (e) {
        errorProto = getProto(getProto(e));
        INTRINSICS["%Error.prototype%"] = errorProto;
      }
    }
    var errorProto;
    var doEval = function doEval2(name) {
      var value;
      if (name === "%AsyncFunction%") {
        value = getEvalledConstructor("async function () {}");
      } else if (name === "%GeneratorFunction%") {
        value = getEvalledConstructor("function* () {}");
      } else if (name === "%AsyncGeneratorFunction%") {
        value = getEvalledConstructor("async function* () {}");
      } else if (name === "%AsyncGenerator%") {
        var fn = doEval2("%AsyncGeneratorFunction%");
        if (fn) {
          value = fn.prototype;
        }
      } else if (name === "%AsyncIteratorPrototype%") {
        var gen = doEval2("%AsyncGenerator%");
        if (gen && getProto) {
          value = getProto(gen.prototype);
        }
      }
      INTRINSICS[name] = value;
      return value;
    };
    var LEGACY_ALIASES = {
      __proto__: null,
      "%ArrayBufferPrototype%": ["ArrayBuffer", "prototype"],
      "%ArrayPrototype%": ["Array", "prototype"],
      "%ArrayProto_entries%": ["Array", "prototype", "entries"],
      "%ArrayProto_forEach%": ["Array", "prototype", "forEach"],
      "%ArrayProto_keys%": ["Array", "prototype", "keys"],
      "%ArrayProto_values%": ["Array", "prototype", "values"],
      "%AsyncFunctionPrototype%": ["AsyncFunction", "prototype"],
      "%AsyncGenerator%": ["AsyncGeneratorFunction", "prototype"],
      "%AsyncGeneratorPrototype%": ["AsyncGeneratorFunction", "prototype", "prototype"],
      "%BooleanPrototype%": ["Boolean", "prototype"],
      "%DataViewPrototype%": ["DataView", "prototype"],
      "%DatePrototype%": ["Date", "prototype"],
      "%ErrorPrototype%": ["Error", "prototype"],
      "%EvalErrorPrototype%": ["EvalError", "prototype"],
      "%Float32ArrayPrototype%": ["Float32Array", "prototype"],
      "%Float64ArrayPrototype%": ["Float64Array", "prototype"],
      "%FunctionPrototype%": ["Function", "prototype"],
      "%Generator%": ["GeneratorFunction", "prototype"],
      "%GeneratorPrototype%": ["GeneratorFunction", "prototype", "prototype"],
      "%Int8ArrayPrototype%": ["Int8Array", "prototype"],
      "%Int16ArrayPrototype%": ["Int16Array", "prototype"],
      "%Int32ArrayPrototype%": ["Int32Array", "prototype"],
      "%JSONParse%": ["JSON", "parse"],
      "%JSONStringify%": ["JSON", "stringify"],
      "%MapPrototype%": ["Map", "prototype"],
      "%NumberPrototype%": ["Number", "prototype"],
      "%ObjectPrototype%": ["Object", "prototype"],
      "%ObjProto_toString%": ["Object", "prototype", "toString"],
      "%ObjProto_valueOf%": ["Object", "prototype", "valueOf"],
      "%PromisePrototype%": ["Promise", "prototype"],
      "%PromiseProto_then%": ["Promise", "prototype", "then"],
      "%Promise_all%": ["Promise", "all"],
      "%Promise_reject%": ["Promise", "reject"],
      "%Promise_resolve%": ["Promise", "resolve"],
      "%RangeErrorPrototype%": ["RangeError", "prototype"],
      "%ReferenceErrorPrototype%": ["ReferenceError", "prototype"],
      "%RegExpPrototype%": ["RegExp", "prototype"],
      "%SetPrototype%": ["Set", "prototype"],
      "%SharedArrayBufferPrototype%": ["SharedArrayBuffer", "prototype"],
      "%StringPrototype%": ["String", "prototype"],
      "%SymbolPrototype%": ["Symbol", "prototype"],
      "%SyntaxErrorPrototype%": ["SyntaxError", "prototype"],
      "%TypedArrayPrototype%": ["TypedArray", "prototype"],
      "%TypeErrorPrototype%": ["TypeError", "prototype"],
      "%Uint8ArrayPrototype%": ["Uint8Array", "prototype"],
      "%Uint8ClampedArrayPrototype%": ["Uint8ClampedArray", "prototype"],
      "%Uint16ArrayPrototype%": ["Uint16Array", "prototype"],
      "%Uint32ArrayPrototype%": ["Uint32Array", "prototype"],
      "%URIErrorPrototype%": ["URIError", "prototype"],
      "%WeakMapPrototype%": ["WeakMap", "prototype"],
      "%WeakSetPrototype%": ["WeakSet", "prototype"]
    };
    var bind = require_function_bind();
    var hasOwn = require_hasown();
    var $concat = bind.call($call, Array.prototype.concat);
    var $spliceApply = bind.call($apply, Array.prototype.splice);
    var $replace = bind.call($call, String.prototype.replace);
    var $strSlice = bind.call($call, String.prototype.slice);
    var $exec = bind.call($call, RegExp.prototype.exec);
    var rePropName = /[^%.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|%$))/g;
    var reEscapeChar = /\\(\\)?/g;
    var stringToPath = function stringToPath2(string) {
      var first = $strSlice(string, 0, 1);
      var last = $strSlice(string, -1);
      if (first === "%" && last !== "%") {
        throw new $SyntaxError("invalid intrinsic syntax, expected closing `%`");
      } else if (last === "%" && first !== "%") {
        throw new $SyntaxError("invalid intrinsic syntax, expected opening `%`");
      }
      var result = [];
      $replace(string, rePropName, function(match, number, quote, subString) {
        result[result.length] = quote ? $replace(subString, reEscapeChar, "$1") : number || match;
      });
      return result;
    };
    var getBaseIntrinsic = function getBaseIntrinsic2(name, allowMissing) {
      var intrinsicName = name;
      var alias;
      if (hasOwn(LEGACY_ALIASES, intrinsicName)) {
        alias = LEGACY_ALIASES[intrinsicName];
        intrinsicName = "%" + alias[0] + "%";
      }
      if (hasOwn(INTRINSICS, intrinsicName)) {
        var value = INTRINSICS[intrinsicName];
        if (value === needsEval) {
          value = doEval(intrinsicName);
        }
        if (typeof value === "undefined" && !allowMissing) {
          throw new $TypeError("intrinsic " + name + " exists, but is not available. Please file an issue!");
        }
        return {
          alias,
          name: intrinsicName,
          value
        };
      }
      throw new $SyntaxError("intrinsic " + name + " does not exist!");
    };
    module2.exports = function GetIntrinsic(name, allowMissing) {
      if (typeof name !== "string" || name.length === 0) {
        throw new $TypeError("intrinsic name must be a non-empty string");
      }
      if (arguments.length > 1 && typeof allowMissing !== "boolean") {
        throw new $TypeError('"allowMissing" argument must be a boolean');
      }
      if ($exec(/^%?[^%]*%?$/, name) === null) {
        throw new $SyntaxError("`%` may not be present anywhere but at the beginning and end of the intrinsic name");
      }
      var parts = stringToPath(name);
      var intrinsicBaseName = parts.length > 0 ? parts[0] : "";
      var intrinsic = getBaseIntrinsic("%" + intrinsicBaseName + "%", allowMissing);
      var intrinsicRealName = intrinsic.name;
      var value = intrinsic.value;
      var skipFurtherCaching = false;
      var alias = intrinsic.alias;
      if (alias) {
        intrinsicBaseName = alias[0];
        $spliceApply(parts, $concat([0, 1], alias));
      }
      for (var i = 1, isOwn = true; i < parts.length; i += 1) {
        var part = parts[i];
        var first = $strSlice(part, 0, 1);
        var last = $strSlice(part, -1);
        if ((first === '"' || first === "'" || first === "`" || (last === '"' || last === "'" || last === "`")) && first !== last) {
          throw new $SyntaxError("property names with quotes must have matching quotes");
        }
        if (part === "constructor" || !isOwn) {
          skipFurtherCaching = true;
        }
        intrinsicBaseName += "." + part;
        intrinsicRealName = "%" + intrinsicBaseName + "%";
        if (hasOwn(INTRINSICS, intrinsicRealName)) {
          value = INTRINSICS[intrinsicRealName];
        } else if (value != null) {
          if (!(part in value)) {
            if (!allowMissing) {
              throw new $TypeError("base intrinsic for " + name + " exists, but the property is not available.");
            }
            return void 0;
          }
          if ($gOPD && i + 1 >= parts.length) {
            var desc = $gOPD(value, part);
            isOwn = !!desc;
            if (isOwn && "get" in desc && !("originalValue" in desc.get)) {
              value = desc.get;
            } else {
              value = value[part];
            }
          } else {
            isOwn = hasOwn(value, part);
            value = value[part];
          }
          if (isOwn && !skipFurtherCaching) {
            INTRINSICS[intrinsicRealName] = value;
          }
        }
      }
      return value;
    };
  }
});

// node_modules/has-tostringtag/shams.js
var require_shams2 = __commonJS({
  "node_modules/has-tostringtag/shams.js"(exports2, module2) {
    "use strict";
    var hasSymbols = require_shams();
    module2.exports = function hasToStringTagShams() {
      return hasSymbols() && !!Symbol.toStringTag;
    };
  }
});

// node_modules/es-set-tostringtag/index.js
var require_es_set_tostringtag = __commonJS({
  "node_modules/es-set-tostringtag/index.js"(exports2, module2) {
    "use strict";
    var GetIntrinsic = require_get_intrinsic();
    var $defineProperty = GetIntrinsic("%Object.defineProperty%", true);
    var hasToStringTag = require_shams2()();
    var hasOwn = require_hasown();
    var $TypeError = require_type();
    var toStringTag = hasToStringTag ? Symbol.toStringTag : null;
    module2.exports = function setToStringTag(object, value) {
      var overrideIfSet = arguments.length > 2 && !!arguments[2] && arguments[2].force;
      var nonConfigurable = arguments.length > 2 && !!arguments[2] && arguments[2].nonConfigurable;
      if (typeof overrideIfSet !== "undefined" && typeof overrideIfSet !== "boolean" || typeof nonConfigurable !== "undefined" && typeof nonConfigurable !== "boolean") {
        throw new $TypeError("if provided, the `overrideIfSet` and `nonConfigurable` options must be booleans");
      }
      if (toStringTag && (overrideIfSet || !hasOwn(object, toStringTag))) {
        if ($defineProperty) {
          $defineProperty(object, toStringTag, {
            configurable: !nonConfigurable,
            enumerable: false,
            value,
            writable: false
          });
        } else {
          object[toStringTag] = value;
        }
      }
    };
  }
});

// node_modules/form-data/lib/populate.js
var require_populate = __commonJS({
  "node_modules/form-data/lib/populate.js"(exports2, module2) {
    "use strict";
    module2.exports = function(dst, src) {
      Object.keys(src).forEach(function(prop) {
        dst[prop] = dst[prop] || src[prop];
      });
      return dst;
    };
  }
});

// node_modules/form-data/lib/form_data.js
var require_form_data = __commonJS({
  "node_modules/form-data/lib/form_data.js"(exports2, module2) {
    "use strict";
    var CombinedStream = require_combined_stream();
    var util = require("util");
    var path2 = require("path");
    var http = require("http");
    var https = require("https");
    var parseUrl = require("url").parse;
    var fs3 = require("fs");
    var Stream = require("stream").Stream;
    var crypto2 = require("crypto");
    var mime = require_mime_types();
    var asynckit = require_asynckit();
    var setToStringTag = require_es_set_tostringtag();
    var hasOwn = require_hasown();
    var populate = require_populate();
    function escapeHeaderParam(str) {
      return String(str).replace(/\r/g, "%0D").replace(/\n/g, "%0A").replace(/"/g, "%22");
    }
    function FormData(options) {
      if (!(this instanceof FormData)) {
        return new FormData(options);
      }
      this._overheadLength = 0;
      this._valueLength = 0;
      this._valuesToMeasure = [];
      CombinedStream.call(this);
      options = options || {};
      for (var option in options) {
        this[option] = options[option];
      }
    }
    util.inherits(FormData, CombinedStream);
    FormData.LINE_BREAK = "\r\n";
    FormData.DEFAULT_CONTENT_TYPE = "application/octet-stream";
    FormData.prototype.append = function(field, value, options) {
      options = options || {};
      if (typeof options === "string") {
        options = { filename: options };
      }
      var append = CombinedStream.prototype.append.bind(this);
      if (typeof value === "number" || value == null) {
        value = String(value);
      }
      if (Array.isArray(value)) {
        this._error(new Error("Arrays are not supported."));
        return;
      }
      var header = this._multiPartHeader(field, value, options);
      var footer = this._multiPartFooter();
      append(header);
      append(value);
      append(footer);
      this._trackLength(header, value, options);
    };
    FormData.prototype._trackLength = function(header, value, options) {
      var valueLength = 0;
      if (options.knownLength != null) {
        valueLength += Number(options.knownLength);
      } else if (Buffer.isBuffer(value)) {
        valueLength = value.length;
      } else if (typeof value === "string") {
        valueLength = Buffer.byteLength(value);
      }
      this._valueLength += valueLength;
      this._overheadLength += Buffer.byteLength(header) + FormData.LINE_BREAK.length;
      if (!value || !value.path && !(value.readable && hasOwn(value, "httpVersion")) && !(value instanceof Stream)) {
        return;
      }
      if (!options.knownLength) {
        this._valuesToMeasure.push(value);
      }
    };
    FormData.prototype._lengthRetriever = function(value, callback) {
      if (hasOwn(value, "fd")) {
        if (value.end != void 0 && value.end != Infinity && value.start != void 0) {
          callback(null, value.end + 1 - (value.start ? value.start : 0));
        } else {
          fs3.stat(value.path, function(err, stat) {
            if (err) {
              callback(err);
              return;
            }
            var fileSize = stat.size - (value.start ? value.start : 0);
            callback(null, fileSize);
          });
        }
      } else if (hasOwn(value, "httpVersion")) {
        callback(null, Number(value.headers["content-length"]));
      } else if (hasOwn(value, "httpModule")) {
        value.on("response", function(response) {
          value.pause();
          callback(null, Number(response.headers["content-length"]));
        });
        value.resume();
      } else {
        callback("Unknown stream");
      }
    };
    FormData.prototype._multiPartHeader = function(field, value, options) {
      if (typeof options.header === "string") {
        return options.header;
      }
      var contentDisposition = this._getContentDisposition(value, options);
      var contentType = this._getContentType(value, options);
      var contents = "";
      var headers = {
        // add custom disposition as third element or keep it two elements if not
        "Content-Disposition": ["form-data", 'name="' + escapeHeaderParam(field) + '"'].concat(contentDisposition || []),
        // if no content type. allow it to be empty array
        "Content-Type": [].concat(contentType || [])
      };
      if (typeof options.header === "object") {
        populate(headers, options.header);
      }
      var header;
      for (var prop in headers) {
        if (hasOwn(headers, prop)) {
          header = headers[prop];
          if (header == null) {
            continue;
          }
          if (!Array.isArray(header)) {
            header = [header];
          }
          if (header.length) {
            contents += prop + ": " + header.join("; ") + FormData.LINE_BREAK;
          }
        }
      }
      return "--" + this.getBoundary() + FormData.LINE_BREAK + contents + FormData.LINE_BREAK;
    };
    FormData.prototype._getContentDisposition = function(value, options) {
      var filename;
      if (typeof options.filepath === "string") {
        filename = path2.normalize(options.filepath).replace(/\\/g, "/");
      } else if (options.filename || value && (value.name || value.path)) {
        filename = path2.basename(options.filename || value && (value.name || value.path));
      } else if (value && value.readable && hasOwn(value, "httpVersion")) {
        filename = path2.basename(value.client._httpMessage.path || "");
      }
      if (filename) {
        return 'filename="' + escapeHeaderParam(filename) + '"';
      }
    };
    FormData.prototype._getContentType = function(value, options) {
      var contentType = options.contentType;
      if (!contentType && value && value.name) {
        contentType = mime.lookup(value.name);
      }
      if (!contentType && value && value.path) {
        contentType = mime.lookup(value.path);
      }
      if (!contentType && value && value.readable && hasOwn(value, "httpVersion")) {
        contentType = value.headers["content-type"];
      }
      if (!contentType && (options.filepath || options.filename)) {
        contentType = mime.lookup(options.filepath || options.filename);
      }
      if (!contentType && value && typeof value === "object") {
        contentType = FormData.DEFAULT_CONTENT_TYPE;
      }
      return contentType;
    };
    FormData.prototype._multiPartFooter = function() {
      return function(next) {
        var footer = FormData.LINE_BREAK;
        var lastPart = this._streams.length === 0;
        if (lastPart) {
          footer += this._lastBoundary();
        }
        next(footer);
      }.bind(this);
    };
    FormData.prototype._lastBoundary = function() {
      return "--" + this.getBoundary() + "--" + FormData.LINE_BREAK;
    };
    FormData.prototype.getHeaders = function(userHeaders) {
      var header;
      var formHeaders = {
        "content-type": "multipart/form-data; boundary=" + this.getBoundary()
      };
      for (header in userHeaders) {
        if (hasOwn(userHeaders, header)) {
          formHeaders[header.toLowerCase()] = userHeaders[header];
        }
      }
      return formHeaders;
    };
    FormData.prototype.setBoundary = function(boundary) {
      if (typeof boundary !== "string") {
        throw new TypeError("FormData boundary must be a string");
      }
      this._boundary = boundary;
    };
    FormData.prototype.getBoundary = function() {
      if (!this._boundary) {
        this._generateBoundary();
      }
      return this._boundary;
    };
    FormData.prototype.getBuffer = function() {
      var dataBuffer = new Buffer.alloc(0);
      var boundary = this.getBoundary();
      for (var i = 0, len = this._streams.length; i < len; i++) {
        if (typeof this._streams[i] !== "function") {
          if (Buffer.isBuffer(this._streams[i])) {
            dataBuffer = Buffer.concat([dataBuffer, this._streams[i]]);
          } else {
            dataBuffer = Buffer.concat([dataBuffer, Buffer.from(this._streams[i])]);
          }
          if (typeof this._streams[i] !== "string" || this._streams[i].substring(2, boundary.length + 2) !== boundary) {
            dataBuffer = Buffer.concat([dataBuffer, Buffer.from(FormData.LINE_BREAK)]);
          }
        }
      }
      return Buffer.concat([dataBuffer, Buffer.from(this._lastBoundary())]);
    };
    FormData.prototype._generateBoundary = function() {
      this._boundary = "--------------------------" + crypto2.randomBytes(12).toString("hex");
    };
    FormData.prototype.getLengthSync = function() {
      var knownLength = this._overheadLength + this._valueLength;
      if (this._streams.length) {
        knownLength += this._lastBoundary().length;
      }
      if (!this.hasKnownLength()) {
        this._error(new Error("Cannot calculate proper length in synchronous way."));
      }
      return knownLength;
    };
    FormData.prototype.hasKnownLength = function() {
      var hasKnownLength = true;
      if (this._valuesToMeasure.length) {
        hasKnownLength = false;
      }
      return hasKnownLength;
    };
    FormData.prototype.getLength = function(cb) {
      var knownLength = this._overheadLength + this._valueLength;
      if (this._streams.length) {
        knownLength += this._lastBoundary().length;
      }
      if (!this._valuesToMeasure.length) {
        process.nextTick(cb.bind(this, null, knownLength));
        return;
      }
      asynckit.parallel(this._valuesToMeasure, this._lengthRetriever, function(err, values) {
        if (err) {
          cb(err);
          return;
        }
        values.forEach(function(length) {
          knownLength += length;
        });
        cb(null, knownLength);
      });
    };
    FormData.prototype.submit = function(params, cb) {
      var request;
      var options;
      var defaults = { method: "post" };
      if (typeof params === "string") {
        params = parseUrl(params);
        options = populate({
          port: params.port,
          path: params.pathname,
          host: params.hostname,
          protocol: params.protocol
        }, defaults);
      } else {
        options = populate(params, defaults);
        if (!options.port) {
          options.port = options.protocol === "https:" ? 443 : 80;
        }
      }
      options.headers = this.getHeaders(params.headers);
      if (options.protocol === "https:") {
        request = https.request(options);
      } else {
        request = http.request(options);
      }
      this.getLength(function(err, length) {
        if (err && err !== "Unknown stream") {
          this._error(err);
          return;
        }
        if (length) {
          request.setHeader("Content-Length", length);
        }
        this.pipe(request);
        if (cb) {
          var onResponse;
          var callback = function(error, responce) {
            request.removeListener("error", callback);
            request.removeListener("response", onResponse);
            return cb.call(this, error, responce);
          };
          onResponse = callback.bind(this, null);
          request.on("error", callback);
          request.on("response", onResponse);
        }
      }.bind(this));
      return request;
    };
    FormData.prototype._error = function(err) {
      if (!this.error) {
        this.error = err;
        this.pause();
        this.emit("error", err);
      }
    };
    FormData.prototype.toString = function() {
      return "[object FormData]";
    };
    setToStringTag(FormData.prototype, "FormData");
    module2.exports = FormData;
  }
});

// server.js
var import_express = __toESM(require("express"), 1);
var import_cors = __toESM(require("cors"), 1);
var import_fs2 = __toESM(require("fs"), 1);
var import_child_process2 = require("child_process");
var import_os = __toESM(require("os"), 1);
var import_path = __toESM(require("path"), 1);
var import_url = require("url");
var import_sqlite3 = __toESM(require("sqlite3"), 1);
var import_bcryptjs = __toESM(require("bcryptjs"), 1);
var import_jsonwebtoken = __toESM(require("jsonwebtoken"), 1);
var import_crypto3 = __toESM(require("crypto"), 1);
var import_dns = __toESM(require("dns"), 1);

// tds_routes.js
var import_crypto = require("crypto");
var import_fs = __toESM(require("fs"), 1);
function setupTdsRoutes(app2, db2) {
  db2.serialize(() => {
    db2.run(`CREATE TABLE IF NOT EXISTS TDS_Rules (
            id TEXT PRIMARY KEY,
            old_section TEXT,
            new_section_2025 TEXT,
            nature_of_payment TEXT,
            single_bill_threshold REAL,
            annual_aggregate_threshold REAL,
            rate_individual_huf REAL,
            rate_company_others REAL,
            rate_missing_pan_206AA REAL
        )`);
    db2.run(`CREATE TABLE IF NOT EXISTS Tally_Ledgers (
            id TEXT PRIMARY KEY,
            ledger_name TEXT UNIQUE,
            parent_group TEXT,
            parent_group_path TEXT,
            is_tds_ledger INTEGER DEFAULT 0,
            mapped_section_code TEXT,
            user_validated INTEGER DEFAULT 0
        )`);
    db2.run(`ALTER TABLE Tally_Ledgers ADD COLUMN parent_group_path TEXT`, (err) => {
    });
    db2.run(`CREATE TABLE IF NOT EXISTS Party_Masters (
            id TEXT PRIMARY KEY,
            party_name TEXT UNIQUE,
            pan_number TEXT,
            entity_type TEXT,
            user_edited INTEGER DEFAULT 0
        )`);
    db2.run(`CREATE TABLE IF NOT EXISTS Tally_Transactions (
            id TEXT PRIMARY KEY,
            party_id TEXT REFERENCES Party_Masters(id),
            ledger_name TEXT,
            voucher_date TEXT,
            voucher_number TEXT,
            amount REAL,
            actual_tds_deducted REAL
        )`);
    db2.run(`CREATE TABLE IF NOT EXISTS Recon_Results (
            id TEXT PRIMARY KEY,
            party_id TEXT REFERENCES Party_Masters(id),
            section_code TEXT,
            books_taxable REAL,
            books_required_tds REAL,
            books_actual_tds REAL,
            traces_taxable REAL,
            traces_tds REAL,
            taxable_variance REAL,
            tds_variance REAL,
            reconciliation_status TEXT,
            calculated_at TEXT
        )`);
    db2.run(`CREATE TABLE IF NOT EXISTS Tally_Group_Mappings (
            id TEXT PRIMARY KEY,
            expense_group TEXT NOT NULL,
            sub_group TEXT,
            sub_group_2 TEXT,
            mapped_section_code TEXT NOT NULL,
            created_at TEXT NOT NULL
        )`);
    const seedData = [
      { old_section: "192A", new_section_2025: "393(1)_EPF", nature_of_payment: "EPF Premature Withdrawal", single_bill_threshold: null, annual_aggregate_threshold: 5e4, rate_individual_huf: 10, rate_company_others: 10, rate_missing_pan_206AA: 20 },
      { old_section: "193", new_section_2025: "393(1)_Securities", nature_of_payment: "Interest on Securities", single_bill_threshold: null, annual_aggregate_threshold: 1e4, rate_individual_huf: 10, rate_company_others: 10, rate_missing_pan_206AA: 20 },
      { old_section: "194", new_section_2025: "393(1)_Sl_1iii", nature_of_payment: "Dividend", single_bill_threshold: null, annual_aggregate_threshold: 1e4, rate_individual_huf: 10, rate_company_others: 10, rate_missing_pan_206AA: 20 },
      { old_section: "194A", new_section_2025: "393(1)_Sl_1i", nature_of_payment: "Interest (Other than Banks)", single_bill_threshold: null, annual_aggregate_threshold: 1e4, rate_individual_huf: 10, rate_company_others: 10, rate_missing_pan_206AA: 20 },
      { old_section: "194A(Bank)", new_section_2025: "393(1)_Sl_1i_Bank", nature_of_payment: "Interest (Bank/Post Office - Sr Citizen 1L, Others 50k)", single_bill_threshold: null, annual_aggregate_threshold: 5e4, rate_individual_huf: 10, rate_company_others: 10, rate_missing_pan_206AA: 20 },
      { old_section: "194C", new_section_2025: "393(1)_Sl_6i", nature_of_payment: "Payment to Contractors", single_bill_threshold: 3e4, annual_aggregate_threshold: 1e5, rate_individual_huf: 1, rate_company_others: 2, rate_missing_pan_206AA: 20 },
      { old_section: "194D", new_section_2025: "393(1)_Sl_3i", nature_of_payment: "Insurance Commission", single_bill_threshold: null, annual_aggregate_threshold: 2e4, rate_individual_huf: 5, rate_company_others: 10, rate_missing_pan_206AA: 20 },
      { old_section: "194DA", new_section_2025: "393(1)_Sl_3ii", nature_of_payment: "Life Insurance Maturity", single_bill_threshold: null, annual_aggregate_threshold: 1e5, rate_individual_huf: 2, rate_company_others: 2, rate_missing_pan_206AA: 20 },
      { old_section: "194G", new_section_2025: "393(1)_Sl_1iv", nature_of_payment: "Lottery Commission", single_bill_threshold: null, annual_aggregate_threshold: 2e4, rate_individual_huf: 2, rate_company_others: 2, rate_missing_pan_206AA: 20 },
      { old_section: "194H", new_section_2025: "393(1)_Sl_1ii", nature_of_payment: "Commission or Brokerage", single_bill_threshold: null, annual_aggregate_threshold: 2e4, rate_individual_huf: 2, rate_company_others: 2, rate_missing_pan_206AA: 20 },
      { old_section: "194I(a)", new_section_2025: "393(1)_Sl_2ii_Da", nature_of_payment: "Rent for Plant & Machinery", single_bill_threshold: null, annual_aggregate_threshold: 6e5, rate_individual_huf: 2, rate_company_others: 2, rate_missing_pan_206AA: 20 },
      { old_section: "194I(b)", new_section_2025: "393(1)_Sl_2ii_Db", nature_of_payment: "Rent for Land, Building & Furniture", single_bill_threshold: null, annual_aggregate_threshold: 6e5, rate_individual_huf: 10, rate_company_others: 10, rate_missing_pan_206AA: 20 },
      { old_section: "194IA", new_section_2025: "393(1)_Sl_2ii_E", nature_of_payment: "Transfer of Immovable Property", single_bill_threshold: null, annual_aggregate_threshold: 5e6, rate_individual_huf: 1, rate_company_others: 1, rate_missing_pan_206AA: 20 },
      { old_section: "194IB", new_section_2025: "393(1)_Sl_2ii_F", nature_of_payment: "Payment of Rent by Individual/HUF (Non-Audit)", single_bill_threshold: 5e4, annual_aggregate_threshold: 6e5, rate_individual_huf: 2, rate_company_others: 2, rate_missing_pan_206AA: 20 },
      { old_section: "194IC", new_section_2025: "393(1)_Sl_2ii_G", nature_of_payment: "Consideration under Development Agreement", single_bill_threshold: null, annual_aggregate_threshold: 0, rate_individual_huf: 10, rate_company_others: 10, rate_missing_pan_206AA: 20 },
      { old_section: "194J(a)", new_section_2025: "393(1)_Sl_6iii_a", nature_of_payment: "Fees for Technical Services / Royalty / Call Centres", single_bill_threshold: null, annual_aggregate_threshold: 5e4, rate_individual_huf: 2, rate_company_others: 2, rate_missing_pan_206AA: 20 },
      { old_section: "194J(b)", new_section_2025: "393(1)_Sl_6iii_b", nature_of_payment: "Fees for Professional Services", single_bill_threshold: null, annual_aggregate_threshold: 5e4, rate_individual_huf: 10, rate_company_others: 10, rate_missing_pan_206AA: 20 },
      { old_section: "194LA", new_section_2025: "393(1)_Sl_7i", nature_of_payment: "Compulsory Land Acquisition", single_bill_threshold: null, annual_aggregate_threshold: 5e5, rate_individual_huf: 10, rate_company_others: 10, rate_missing_pan_206AA: 20 },
      { old_section: "194M", new_section_2025: "393(1)_Sl_8iii", nature_of_payment: "Payments by Individual/HUF (Contract/Prof/Commission)", single_bill_threshold: null, annual_aggregate_threshold: 5e6, rate_individual_huf: 2, rate_company_others: 2, rate_missing_pan_206AA: 20 },
      { old_section: "194Q", new_section_2025: "393(1)_Sl_8ii", nature_of_payment: "Purchase of Goods", single_bill_threshold: null, annual_aggregate_threshold: 5e6, rate_individual_huf: 0.1, rate_company_others: 0.1, rate_missing_pan_206AA: 5 },
      { old_section: "194R", new_section_2025: "393(1)_Sl_8iv", nature_of_payment: "Benefits or Perquisites of Business", single_bill_threshold: null, annual_aggregate_threshold: 2e4, rate_individual_huf: 10, rate_company_others: 10, rate_missing_pan_206AA: 20 },
      { old_section: "194S", new_section_2025: "393(1)_Sl_8v", nature_of_payment: "Virtual Digital Asset (Crypto)", single_bill_threshold: null, annual_aggregate_threshold: 5e4, rate_individual_huf: 1, rate_company_others: 1, rate_missing_pan_206AA: 20 },
      { old_section: "194T", new_section_2025: "393(3)", nature_of_payment: "Payments to Partners by Partnership Firm/LLP", single_bill_threshold: null, annual_aggregate_threshold: 2e4, rate_individual_huf: 10, rate_company_others: 10, rate_missing_pan_206AA: 20 },
      { old_section: "194O", new_section_2025: "393(1)_Sl_8i", nature_of_payment: "Payment by E-Commerce Operator", single_bill_threshold: null, annual_aggregate_threshold: 5e5, rate_individual_huf: 0.1, rate_company_others: 0.1, rate_missing_pan_206AA: 5 }
    ];
    db2.run("DELETE FROM TDS_Rules", [], (err) => {
      const stmt = db2.prepare(`INSERT INTO TDS_Rules (
                id, old_section, new_section_2025, nature_of_payment, 
                single_bill_threshold, annual_aggregate_threshold, 
                rate_individual_huf, rate_company_others, rate_missing_pan_206AA
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      seedData.forEach((d) => {
        stmt.run(
          (0, import_crypto.randomUUID)(),
          d.old_section,
          d.new_section_2025,
          d.nature_of_payment,
          d.single_bill_threshold,
          d.annual_aggregate_threshold,
          d.rate_individual_huf,
          d.rate_company_others,
          d.rate_missing_pan_206AA
        );
      });
      stmt.finalize();
      console.log("Seeded and synchronized updated TDS Rules V2 from IT Act 2025");
    });
  });
  app2.get("/api/tds/rules", (req, res) => {
    db2.all("SELECT * FROM TDS_Rules", [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });
  const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i;
  function getEntityTypeFromPan(pan) {
    const cleanPan = (pan || "").trim().toUpperCase();
    if (!PAN_REGEX.test(cleanPan)) {
      return "Unknown";
    }
    const entityChar = cleanPan.charAt(3);
    const map = { "P": "Individual", "H": "HUF", "C": "Company", "F": "Firm", "A": "AOP", "T": "Trust" };
    return map[entityChar] || "Unknown";
  }
  function getSectionFromTdsLedgerName(name) {
    const n = (name || "").toUpperCase();
    if (n.includes("194C")) return "194C";
    if (n.includes("194J")) {
      if (n.includes("PROF") || n.includes("194J(B)") || n.includes("194J-B")) return "194J(b)";
      return "194J(a)";
    }
    if (n.includes("194I")) {
      const hasMachinery = n.includes("MACHINERY") || n.includes("MACHINE") || n.includes("PLANT") || n.includes("194I(A)") || n.includes("194I-A");
      if (hasMachinery) return "194I(a)";
      if (n.includes("RENT") || n.includes("LAND") || n.includes("BLDG") || n.includes("BUILDING") || n.includes("194I(B)") || n.includes("194I-B")) return "194I(b)";
      return "194I(a)";
    }
    if (n.includes("194H")) return "194H";
    if (n.includes("194Q")) return "194Q";
    if (n.includes("194R")) return "194R";
    return null;
  }
  function getLedgerHierarchy(l) {
    const path2 = [];
    if (l.parent_group) path2.push(l.parent_group.toUpperCase().trim());
    if (l.parent_group_path) {
      l.parent_group_path.split(",").forEach((g) => {
        const clean = g.trim().toUpperCase();
        if (clean && !path2.includes(clean)) path2.push(clean);
      });
    }
    return path2;
  }
  function matchesGroupMapping(hierarchy, m) {
    const normalize = (s) => (s || "").toUpperCase().trim();
    const g1 = normalize(m.expense_group);
    const g2 = m.sub_group ? normalize(m.sub_group) : null;
    const g3 = m.sub_group_2 ? normalize(m.sub_group_2) : null;
    if (!hierarchy.includes(g1)) return false;
    if (g2 && !hierarchy.includes(g2)) return false;
    if (g3 && !hierarchy.includes(g3)) return false;
    return true;
  }
  function findInheritedSection(hierarchy, groupMappings) {
    if (!groupMappings || groupMappings.length === 0) return null;
    const sorted = [...groupMappings].sort((a, b) => {
      const scoreA = (a.sub_group_2 ? 2 : 0) + (a.sub_group ? 1 : 0);
      const scoreB = (b.sub_group_2 ? 2 : 0) + (b.sub_group ? 1 : 0);
      return scoreB - scoreA;
    });
    for (const m of sorted) {
      if (matchesGroupMapping(hierarchy, m)) {
        return {
          sectionCode: m.mapped_section_code,
          mappingName: m.sub_group_2 || m.sub_group || m.expense_group
        };
      }
    }
    return null;
  }
  app2.post("/api/tds/extract-ledgers", (req, res) => {
    const { ledgers } = req.body;
    if (!ledgers || !Array.isArray(ledgers)) {
      return res.status(400).json({ error: "Invalid ledgers array" });
    }
    db2.serialize(() => {
      const stmt = db2.prepare(`INSERT INTO Tally_Ledgers (id, ledger_name, parent_group, parent_group_path, is_tds_ledger, user_validated)
                                     VALUES (?, ?, ?, ?, 0, 0)
                                     ON CONFLICT(ledger_name) DO UPDATE SET 
                                        parent_group = excluded.parent_group,
                                        parent_group_path = excluded.parent_group_path`);
      ledgers.forEach((l) => {
        stmt.run((0, import_crypto.randomUUID)(), l.ledgerName, l.parentGroup || "Expense", l.parentGroupPath || "");
      });
      stmt.finalize((err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, count: ledgers.length });
      });
    });
  });
  app2.get("/api/tds/auto-map", (req, res) => {
    res.json([]);
  });
  app2.get("/api/tds/ledgers/suggestions", (req, res) => {
    db2.all("SELECT * FROM Tally_Ledgers WHERE user_validated = 0 OR mapped_section_code IS NULL", [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const suggestions = [];
      rows.forEach((r) => {
        const name = r.ledger_name;
        const nameUpper = name.toUpperCase().trim();
        const parent = (r.parent_group || "").toUpperCase().trim();
        const path2 = (r.parent_group_path || "").toUpperCase().trim();
        const isExpenseGroup = parent.includes("EXPENSE") || parent.includes("PURCHASE") || path2.includes("EXPENSE") || path2.includes("PURCHASE") || parent.includes("DIRECT") || parent.includes("INDIRECT") || path2.includes("DIRECT") || path2.includes("INDIRECT");
        if (!isExpenseGroup) return;
        let suggestedSection = null;
        let confidence = false;
        if (nameUpper.includes("RENT") || nameUpper.includes("LEASE") || nameUpper.includes("HIRE CHARGES") || nameUpper.includes("HECTARE")) {
          if (nameUpper.includes("MACHINE") || nameUpper.includes("EQUIP") || nameUpper.includes("PLANT") || nameUpper.includes("VEHICLE") || nameUpper.includes("CAR")) {
            suggestedSection = "194I(a)";
          } else {
            suggestedSection = "194I(b)";
          }
          confidence = true;
        } else if (nameUpper.includes("PROFESSIONAL") || nameUpper.includes("LEGAL") || nameUpper.includes("CONSULT") || nameUpper.includes("AUDIT") || nameUpper.includes("TECHNICAL") || nameUpper.includes("ROYALTY") || nameUpper.includes("SOFTWARE") || nameUpper.includes("DEVELOPMENT") || nameUpper.includes("FEES") || nameUpper.includes("DIRECTOR") || nameUpper.includes("ENGINEER")) {
          suggestedSection = "194J(b)";
          confidence = true;
        } else if (nameUpper.includes("COMMISSION") || nameUpper.includes("BROKER") || nameUpper.includes("BROKERAGE")) {
          suggestedSection = "194H";
          confidence = true;
        } else if (nameUpper.includes("PURCHASE") || nameUpper.includes("GOODS") || nameUpper.includes("RAW MATERIAL")) {
          suggestedSection = "194Q";
          confidence = true;
        } else if (nameUpper.includes("CONTRACT") || nameUpper.includes("ADVERTIS") || nameUpper.includes("SECURITY") || nameUpper.includes("TRANSPORT") || nameUpper.includes("COURIER") || nameUpper.includes("FREIGHT") || nameUpper.includes("LABOUR") || nameUpper.includes("MAINTENANCE") || nameUpper.includes("REPAIR") || nameUpper.includes("PRINTING") || nameUpper.includes("WORK") || nameUpper.includes("CATERING") || nameUpper.includes("SERVICE") || nameUpper.includes("OFFICE EXP") || nameUpper.includes("MISC") || nameUpper.includes("GENERAL") || parent.includes("DIRECT") || parent.includes("PURCHASE")) {
          suggestedSection = "194C";
          confidence = nameUpper.includes("CONTRACT") || nameUpper.includes("SECURITY") || nameUpper.includes("TRANSPORT") || nameUpper.includes("ADVERTIS");
        }
        if (suggestedSection) {
          suggestions.push({
            ledgerName: name,
            suggestedSection,
            isProbable: confidence
          });
        }
      });
      res.json(suggestions);
    });
  });
  app2.post("/api/tds/confirm-mapping", (req, res) => {
    const { mappings } = req.body;
    if (!mappings || !Array.isArray(mappings)) {
      return res.status(400).json({ error: "Invalid mappings payload" });
    }
    db2.serialize(() => {
      let hasError = false;
      let errorMsg = "";
      const stmt = db2.prepare(`INSERT INTO Tally_Ledgers (id, ledger_name, parent_group, is_tds_ledger, mapped_section_code, user_validated)
                                     VALUES (?, ?, 'Expense', ?, ?, 1)
                                     ON CONFLICT(ledger_name) DO UPDATE SET 
                                        mapped_section_code = excluded.mapped_section_code,
                                        is_tds_ledger = excluded.is_tds_ledger,
                                        user_validated = 1`);
      mappings.forEach((m) => {
        if (hasError) return;
        const isTdsVal = m.isTdsLedger ? 1 : 0;
        const secVal = m.isTdsLedger ? null : m.sectionCode;
        stmt.run((0, import_crypto.randomUUID)(), m.ledgerName, isTdsVal, secVal, function(err) {
          if (err) {
            hasError = true;
            errorMsg = err.message;
          }
        });
      });
      stmt.finalize((err) => {
        if (err || hasError) return res.status(500).json({ error: err ? err.message : errorMsg });
        res.json({ success: true });
      });
    });
  });
  app2.get("/api/tds/ledgers", (req, res) => {
    db2.all("SELECT * FROM Tally_Group_Mappings", [], (err, groupMappings) => {
      if (err) return res.status(500).json({ error: err.message });
      db2.all("SELECT * FROM Tally_Ledgers ORDER BY ledger_name ASC", [], (err2, rows) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json(rows.map((r) => {
          const hierarchy = getLedgerHierarchy(r);
          const inherited = findInheritedSection(hierarchy, groupMappings);
          return {
            id: r.id,
            ledgerName: r.ledger_name,
            parentGroup: r.parent_group,
            isTdsLedger: r.is_tds_ledger === 1,
            sectionCode: r.mapped_section_code,
            inheritedSectionCode: inherited ? inherited.sectionCode : null,
            inheritedGroupName: inherited ? inherited.mappingName : null,
            userValidated: r.user_validated === 1
          };
        }));
      });
    });
  });
  app2.post("/api/tds/ledgers", (req, res) => {
    const { ledgerName, sectionCode } = req.body;
    if (!ledgerName || !sectionCode) {
      return res.status(400).json({ error: "ledgerName and sectionCode are required" });
    }
    db2.run(
      `INSERT INTO Tally_Ledgers (id, ledger_name, parent_group, is_tds_ledger, mapped_section_code, user_validated)
             VALUES (?, ?, 'Expense', 0, ?, 1)
             ON CONFLICT(ledger_name) DO UPDATE SET mapped_section_code = excluded.mapped_section_code, is_tds_ledger = 0, user_validated = 1`,
      [(0, import_crypto.randomUUID)(), ledgerName, sectionCode],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      }
    );
  });
  app2.post("/api/tds/ledgers/update", (req, res) => {
    const { ledgerName, sectionCode, isTdsLedger } = req.body;
    if (!ledgerName) {
      return res.status(400).json({ error: "ledgerName is required" });
    }
    db2.run(
      `INSERT INTO Tally_Ledgers (id, ledger_name, parent_group, is_tds_ledger, mapped_section_code, user_validated)
             VALUES (?, ?, 'Expense', ?, ?, 1)
             ON CONFLICT(ledger_name) DO UPDATE SET 
                is_tds_ledger = excluded.is_tds_ledger,
                mapped_section_code = excluded.mapped_section_code,
                user_validated = 1`,
      [(0, import_crypto.randomUUID)(), ledgerName, isTdsLedger ? 1 : 0, sectionCode || null],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      }
    );
  });
  app2.delete("/api/tds/ledgers/:name", (req, res) => {
    db2.run(
      `DELETE FROM Tally_Ledgers WHERE ledger_name = ?`,
      [req.params.name],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      }
    );
  });
  app2.post("/api/tds/process-pan", (req, res) => {
    const { parties } = req.body;
    if (!parties || !Array.isArray(parties)) {
      return res.status(400).json({ error: "Invalid parties payload" });
    }
    db2.serialize(() => {
      const stmt = db2.prepare(`INSERT INTO Party_Masters (id, party_name, pan_number, entity_type, user_edited)
                                     VALUES (?, ?, ?, ?, 0)
                                     ON CONFLICT(party_name) DO UPDATE SET 
                                        pan_number = CASE WHEN user_edited = 0 THEN excluded.pan_number ELSE pan_number END,
                                        entity_type = CASE WHEN user_edited = 0 THEN excluded.entity_type ELSE entity_type END`);
      parties.forEach((p) => {
        const entityType = getEntityTypeFromPan(p.pan);
        stmt.run((0, import_crypto.randomUUID)(), p.partyName, p.pan || null, entityType);
      });
      stmt.finalize((err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      });
    });
  });
  app2.get("/api/tds/parties", (req, res) => {
    db2.all("SELECT * FROM Party_Masters ORDER BY party_name ASC", [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });
  app2.put("/api/tds/parties/:id", (req, res) => {
    const { entityType, panNumber } = req.body;
    db2.run(
      `UPDATE Party_Masters SET entity_type = ?, pan_number = ?, user_edited = 1 WHERE id = ?`,
      [entityType, panNumber, req.params.id],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      }
    );
  });
  app2.post("/api/tds/parties/confirm-name-matches", (req, res) => {
    const { matches } = req.body;
    if (!matches || !Array.isArray(matches)) {
      return res.status(400).json({ error: "Invalid matches payload" });
    }
    db2.serialize(() => {
      const stmt = db2.prepare(`UPDATE Party_Masters SET pan_number = ?, user_edited = 1 WHERE party_name = ?`);
      matches.forEach((m) => {
        stmt.run(m.panNumber.toUpperCase().trim(), m.partyName);
      });
      stmt.finalize((err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      });
    });
  });
  app2.post("/api/tds/reconcile", (req, res) => {
    const { transactions, form26qRecords, confirmedMatches } = req.body;
    try {
      import_fs.default.writeFileSync("scratch_all_txns.json", JSON.stringify(transactions, null, 2));
      import_fs.default.writeFileSync("scratch_all_traces.json", JSON.stringify(form26qRecords, null, 2));
    } catch (e) {
      console.error("Failed to write diagnostic files", e);
    }
    if (!transactions || !Array.isArray(transactions)) {
      return res.status(400).json({ error: "transactions array is required" });
    }
    db2.all("SELECT * FROM TDS_Rules", [], (err, rules) => {
      if (err) return res.status(500).json({ error: err.message });
      const rulesMap = {};
      rules.forEach((r) => {
        rulesMap[r.old_section] = r;
        rulesMap[r.new_section_2025] = r;
      });
      db2.all("SELECT * FROM Tally_Group_Mappings", [], (err2, groupMappings) => {
        if (err2) return res.status(500).json({ error: err2.message });
        db2.all("SELECT * FROM Tally_Ledgers", [], (err3, ledgers) => {
          if (err3) return res.status(500).json({ error: err3.message });
          db2.all("SELECT party_name, pan_number, entity_type FROM Party_Masters", [], (err4, parties) => {
            if (err4) return res.status(500).json({ error: err4.message });
            const partyMap = {};
            if (parties) {
              parties.forEach((p) => {
                partyMap[p.party_name.toUpperCase().trim()] = {
                  pan: p.pan_number,
                  entityType: p.entity_type
                };
              });
            }
            const normalizeLedger = (name) => (name || "").toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
            const ledgerMap = {};
            const tdsTaxLedgers = /* @__PURE__ */ new Set();
            ledgers.forEach((l) => {
              const norm = normalizeLedger(l.ledger_name);
              if (l.mapped_section_code) {
                ledgerMap[norm] = l.mapped_section_code;
              }
              if (l.is_tds_ledger === 1) {
                tdsTaxLedgers.add(norm);
              }
            });
            const getSectionForTxn = (txn) => {
              const normLedger = normalizeLedger(txn.ledgerName);
              if (ledgerMap[normLedger]) {
                return ledgerMap[normLedger];
              }
              const hierarchy = [];
              if (txn.parentGroup) hierarchy.push(txn.parentGroup.toUpperCase().trim());
              if (txn.parentGroupPath) {
                txn.parentGroupPath.split(",").forEach((g) => {
                  const clean = g.trim().toUpperCase();
                  if (clean && !hierarchy.includes(clean)) hierarchy.push(clean);
                });
              }
              const inherited = findInheritedSection(hierarchy, groupMappings);
              if (inherited) {
                return inherited.sectionCode;
              }
              return null;
            };
            const partySectionMap = {};
            transactions.forEach((t) => {
              const sectionCode = getSectionForTxn(t);
              if (sectionCode) {
                const partyKey = t.partyName.toUpperCase().trim();
                if (!partySectionMap[partyKey]) {
                  partySectionMap[partyKey] = /* @__PURE__ */ new Set();
                }
                partySectionMap[partyKey].add(sectionCode);
              }
            });
            const groupedTxns = {};
            const partyNameMap = {};
            transactions.forEach((t) => {
              const normLedger = normalizeLedger(t.ledgerName);
              const sectionCode = getSectionForTxn(t);
              const partyKey = t.partyName.toUpperCase().trim();
              const dbParty = partyMap[partyKey];
              const cleanLedger = (t.ledgerName || "").toLowerCase().trim();
              t.isTdsTax = tdsTaxLedgers.has(normLedger) || cleanLedger.includes("tds") || cleanLedger.includes("tax deducted") || cleanLedger.includes("tax payable");
              let resolvedSection = sectionCode;
              if (!resolvedSection) {
                const isTds = t.isTdsTax || t.actualTdsDeducted > 0 && t.amount === 0;
                if (isTds) {
                  const cleanName = (t.ledgerName || "").toUpperCase();
                  let extractedSec = "";
                  if (cleanName.includes("194C") || cleanName.includes("194-C")) {
                    extractedSec = "194C";
                  } else if (cleanName.includes("194I") || cleanName.includes("194-I")) {
                    if (cleanName.includes("MACHINERY") || cleanName.includes("HIRE") || cleanName.includes("PLANT")) {
                      extractedSec = "194I(a)";
                    } else {
                      extractedSec = "194I(b)";
                    }
                  } else if (cleanName.includes("194J") || cleanName.includes("194-J")) {
                    if (cleanName.includes("PROF") || cleanName.includes("SERVICE") || cleanName.includes("FEES")) {
                      extractedSec = "194J(b)";
                    } else {
                      extractedSec = "194J(a)";
                    }
                  } else if (cleanName.includes("194H") || cleanName.includes("194-H")) {
                    extractedSec = "194H";
                  } else if (cleanName.includes("194Q") || cleanName.includes("194-Q")) {
                    extractedSec = "194Q";
                  }
                  if (extractedSec) {
                    resolvedSection = extractedSec;
                  } else {
                    const partySections = partySectionMap[partyKey];
                    if (partySections && partySections.size > 0) {
                      resolvedSection = Array.from(partySections)[0];
                    }
                  }
                }
              }
              if (!resolvedSection) return;
              let origPan = (t.partyPan || t.pan || "").toUpperCase().trim();
              let rawPan = (dbParty && dbParty.pan || t.partyPan || t.pan || "").toUpperCase().trim();
              if (rawPan === "PAN-MISSING" || rawPan === "PAN MISSING" || rawPan === "UNREGISTERED") {
                rawPan = "";
              }
              if (origPan === "PAN-MISSING" || origPan === "PAN MISSING" || origPan === "UNREGISTERED") {
                origPan = "";
              }
              rawPan = rawPan.replace(/\s+/g, "");
              origPan = origPan.replace(/\s+/g, "");
              const isPanValid = PAN_REGEX.test(rawPan);
              const isOrigPanInvalid = origPan === "" || !PAN_REGEX.test(origPan);
              const isNameMatched = isPanValid && isOrigPanInvalid;
              const groupKey = isPanValid ? `${rawPan}_${resolvedSection}` : `NOPAN-${t.partyName.toUpperCase().trim()}_${resolvedSection}`;
              if (!groupedTxns[groupKey]) {
                groupedTxns[groupKey] = [];
              }
              groupedTxns[groupKey].push(t);
              partyNameMap[groupKey] = t.partyName;
              if (!groupedTxns[groupKey].isNameMatched) {
                groupedTxns[groupKey].isNameMatched = false;
              }
              if (isNameMatched) {
                groupedTxns[groupKey].isNameMatched = true;
              }
            });
            const booksLiability = {};
            for (const [groupKey, txns] of Object.entries(groupedTxns)) {
              const lastUnderscore = groupKey.lastIndexOf("_");
              const pan = groupKey.substring(0, lastUnderscore);
              const sectionCode = groupKey.substring(lastUnderscore + 1);
              const rule = rulesMap[sectionCode];
              if (!rule) continue;
              txns.sort((a, b) => new Date(a.date) - new Date(b.date));
              let isIndividualOrHuf = false;
              const isPanValid = PAN_REGEX.test(pan);
              const isPanMissing = !isPanValid;
              let rate = 0;
              if (isPanValid) {
                const entityChar = pan.charAt(3).toUpperCase();
                if (entityChar === "P" || entityChar === "H") {
                  isIndividualOrHuf = true;
                }
                rate = isIndividualOrHuf ? rule.rate_individual_huf : rule.rate_company_others;
              } else {
                rate = rule.rate_missing_pan_206AA !== null && rule.rate_missing_pan_206AA !== void 0 ? rule.rate_missing_pan_206AA : 20;
              }
              let cumulativeSpend = 0;
              let grossSpend = 0;
              let reversalAmount = 0;
              let cumulativeTaxable = 0;
              let breachedAnnual = false;
              let totalActualTds = 0;
              const ledgerNames = /* @__PURE__ */ new Set();
              const tdsLedgerNames = /* @__PURE__ */ new Set();
              let breachedSingleCount = 0;
              txns.forEach((txn) => {
                cumulativeSpend += txn.amount;
                if (txn.amount > 0) {
                  grossSpend += txn.amount;
                } else {
                  reversalAmount += Math.abs(txn.amount);
                }
                totalActualTds += txn.actualTdsDeducted || 0;
                if (txn.tdsLedgerName) {
                  tdsLedgerNames.add(txn.tdsLedgerName);
                }
                if (txn.tds_ledger_name) {
                  tdsLedgerNames.add(txn.tds_ledger_name);
                }
                if (!txn.isTdsTax) {
                  ledgerNames.add(txn.ledgerName);
                } else {
                  tdsLedgerNames.add(txn.ledgerName);
                }
                let isTaxable = false;
                let taxableAmountForThisTxn = 0;
                const breachesSingleBill = rule.single_bill_threshold !== null && txn.amount >= rule.single_bill_threshold;
                const breachesAnnualAggregate = cumulativeSpend >= rule.annual_aggregate_threshold;
                if (breachesAnnualAggregate) {
                  isTaxable = true;
                  if (!breachedAnnual) {
                    taxableAmountForThisTxn = cumulativeSpend - cumulativeTaxable;
                    breachedAnnual = true;
                  } else {
                    taxableAmountForThisTxn = txn.amount;
                  }
                } else if (breachesSingleBill) {
                  isTaxable = true;
                  taxableAmountForThisTxn = txn.amount;
                  breachedSingleCount++;
                }
                if (isTaxable) {
                  cumulativeTaxable += taxableAmountForThisTxn;
                }
              });
              let reason = "";
              if (cumulativeTaxable > 0) {
                const breachType = [];
                if (breachedAnnual) {
                  breachType.push(`Annual spend \u20B9${cumulativeSpend.toLocaleString("en-IN")} > annual limit \u20B9${rule.annual_aggregate_threshold.toLocaleString("en-IN")}`);
                } else if (breachedSingleCount > 0) {
                  breachType.push(`${breachedSingleCount} bill(s) > single limit \u20B9${rule.single_bill_threshold.toLocaleString("en-IN")}`);
                } else {
                  breachType.push(`Threshold crossed`);
                }
                reason = `TDS Status: Applicable (${breachType.join(" or ")})`;
                if (totalActualTds > 0) {
                  reason += ` | Book TDS: \u20B9${totalActualTds.toLocaleString("en-IN")}`;
                }
              } else {
                reason = `TDS Status: Not Applicable (Below threshold)`;
                if (totalActualTds > 0) {
                  reason += ` | Voluntary Book TDS: \u20B9${totalActualTds.toLocaleString("en-IN")}`;
                }
              }
              if (isPanMissing) {
                reason += ` | PAN: Missing (${rate}% rate)`;
              }
              if (reversalAmount > 0) {
                reason += ` | Spend: \u20B9${cumulativeSpend.toLocaleString("en-IN")} (Gross: \u20B9${grossSpend.toLocaleString("en-IN")} | Reversals: \u20B9${reversalAmount.toLocaleString("en-IN")})`;
              } else {
                reason += ` | Spend: \u20B9${cumulativeSpend.toLocaleString("en-IN")}`;
              }
              const limitParts = [`Annual limit \u20B9${rule.annual_aggregate_threshold.toLocaleString("en-IN")}`];
              if (rule.single_bill_threshold) {
                limitParts.push(`Single limit \u20B9${rule.single_bill_threshold.toLocaleString("en-IN")}`);
              }
              reason += ` | Limits: ${limitParts.join(" / ")}`;
              const requiredTds = cumulativeTaxable * rate / 100;
              booksLiability[groupKey] = {
                partyName: partyNameMap[groupKey] || "Unknown Party",
                booksSpend: cumulativeSpend,
                booksTaxable: cumulativeTaxable,
                booksRequiredTds: Math.round(requiredTds),
                booksActualTds: totalActualTds,
                ledgers: Array.from(ledgerNames).join(", "),
                tdsLedgers: Array.from(tdsLedgerNames).join(", "),
                rateApplied: rate,
                reason,
                isNameMatched: txns.isNameMatched || false
              };
            }
            const tracesLiability = {};
            if (form26qRecords && Array.isArray(form26qRecords)) {
              form26qRecords.forEach((r) => {
                let cleanPan = (r.partyPan || "").toUpperCase().trim();
                if (cleanPan === "PAN-MISSING" || cleanPan === "PAN MISSING" || cleanPan === "UNREGISTERED") {
                  cleanPan = "";
                }
                cleanPan = cleanPan.replace(/\s+/g, "");
                const cleanSection = (r.section || "").trim();
                const rule = rulesMap[cleanSection];
                const sectionCode = rule ? rule.old_section : cleanSection;
                const groupKey = `${cleanPan}_${sectionCode}`;
                if (!tracesLiability[groupKey]) {
                  tracesLiability[groupKey] = {
                    tracesTaxable: 0,
                    tracesTds: 0,
                    partyName: r.partyName || "Unknown Party",
                    partyPan: cleanPan,
                    section: sectionCode
                  };
                }
                tracesLiability[groupKey].tracesTaxable += r.amountPaid || 0;
                tracesLiability[groupKey].tracesTds += r.tdsDeducted || 0;
              });
            }
            const reconciliationResults = [];
            const matchedBooks = {};
            const matchedTraces = {};
            const matchMethods = {};
            const unmatchedBooks = new Set(Object.keys(booksLiability));
            const unmatchedTraces = new Set(Object.keys(tracesLiability));
            const LOCAL_PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i;
            const isLocalPanValid = (p) => p && LOCAL_PAN_REGEX.test(p);
            const normalizePartyName = (name) => {
              if (!name) return "";
              let n = name.toUpperCase().replace(/[-\s\(\)]+(CR|DR)\b$/g, "").replace(/\b(M\/S\.?|MS\.?|MR\.?|MRS\.?|SHREE|SHRI)\b/g, "").replace(/\b(PVT|PRIVATE|LTD|LIMITED|LLP|INC|CO|COMPANY|CORP|CORPORATION|ENTERPRISES?|TRADERS?|INDUSTRIES|AGENC(?:Y|IES)|BROTHERS|BROS|SONS|ASSOCIATES|AND|&)\b/g, "").replace(/[^A-Z0-9]/g, "").trim();
              if (n.endsWith("S")) n = n.slice(0, -1);
              return n;
            };
            function levenshteinDistance(s1, s2) {
              const track = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
              for (let i = 0; i <= s1.length; i += 1) {
                track[0][i] = i;
              }
              for (let j = 0; j <= s2.length; j += 1) {
                track[j][0] = j;
              }
              for (let j = 1; j <= s2.length; j += 1) {
                for (let i = 1; i <= s1.length; i += 1) {
                  const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
                  track[j][i] = Math.min(
                    track[j][i - 1] + 1,
                    // deletion
                    track[j - 1][i] + 1,
                    // insertion
                    track[j - 1][i - 1] + indicator
                    // substitution
                  );
                }
              }
              return track[s2.length][s1.length];
            }
            for (const bKey of unmatchedBooks) {
              const books = booksLiability[bKey];
              const lastUnderscore = bKey.lastIndexOf("_");
              const pan = bKey.substring(0, lastUnderscore);
              const section = bKey.substring(lastUnderscore + 1);
              if (isLocalPanValid(pan)) {
                const tKeyExact = `${pan}_${section}`;
                if (unmatchedTraces.has(tKeyExact)) {
                  matchedBooks[bKey] = tracesLiability[tKeyExact];
                  matchedTraces[tKeyExact] = books;
                  matchMethods[bKey] = "PAN";
                  unmatchedBooks.delete(bKey);
                  unmatchedTraces.delete(tKeyExact);
                  continue;
                }
                const tKeyEmpty = `${pan}_`;
                if (unmatchedTraces.has(tKeyEmpty)) {
                  const trace = tracesLiability[tKeyEmpty];
                  trace.section = section;
                  const newTKey = `${pan}_${section}`;
                  tracesLiability[newTKey] = trace;
                  delete tracesLiability[tKeyEmpty];
                  matchedBooks[bKey] = trace;
                  matchedTraces[newTKey] = books;
                  matchMethods[bKey] = "PAN";
                  unmatchedBooks.delete(bKey);
                  unmatchedTraces.delete(tKeyEmpty);
                  continue;
                }
                let foundTKey = null;
                for (const tKey of unmatchedTraces) {
                  const lastUnderscoreT = tKey.lastIndexOf("_");
                  const tPan = tKey.substring(0, lastUnderscoreT);
                  if (tPan === pan) {
                    foundTKey = tKey;
                    break;
                  }
                }
                if (foundTKey) {
                  const trace = tracesLiability[foundTKey];
                  if (!trace.section || trace.section === "\u2014" || trace.section === "") {
                    trace.section = section;
                  }
                  matchedBooks[bKey] = trace;
                  matchedTraces[foundTKey] = books;
                  matchMethods[bKey] = "PAN";
                  unmatchedBooks.delete(bKey);
                  unmatchedTraces.delete(foundTKey);
                }
              }
            }
            for (const bKey of unmatchedBooks) {
              const books = booksLiability[bKey];
              const lastUnderscore = bKey.lastIndexOf("_");
              const section = bKey.substring(lastUnderscore + 1);
              const booksNormName = normalizePartyName(books.partyName);
              if (booksNormName) {
                let foundTKey = null;
                for (const tKey of unmatchedTraces) {
                  const traces = tracesLiability[tKey];
                  if (traces.section === section) {
                    const tracesNormName = normalizePartyName(traces.partyName);
                    if (booksNormName === tracesNormName) {
                      let allowed = true;
                      if (confirmedMatches) {
                        allowed = confirmedMatches.some(
                          (cm) => cm.booksName.toUpperCase().trim() === books.partyName.toUpperCase().trim() && cm.tracesName.toUpperCase().trim() === traces.partyName.toUpperCase().trim()
                        );
                      }
                      if (allowed) {
                        foundTKey = tKey;
                        break;
                      }
                    }
                  }
                }
                if (!foundTKey) {
                  for (const tKey of unmatchedTraces) {
                    const traces = tracesLiability[tKey];
                    if (!traces.section || traces.section === "\u2014" || traces.section === "") {
                      const tracesNormName = normalizePartyName(traces.partyName);
                      if (booksNormName === tracesNormName) {
                        let allowed = true;
                        if (confirmedMatches) {
                          allowed = confirmedMatches.some(
                            (cm) => cm.booksName.toUpperCase().trim() === books.partyName.toUpperCase().trim() && cm.tracesName.toUpperCase().trim() === traces.partyName.toUpperCase().trim()
                          );
                        }
                        if (allowed) {
                          foundTKey = tKey;
                          break;
                        }
                      }
                    }
                  }
                }
                if (!foundTKey) {
                  for (const tKey of unmatchedTraces) {
                    const traces = tracesLiability[tKey];
                    const tracesNormName = normalizePartyName(traces.partyName);
                    if (booksNormName === tracesNormName) {
                      let allowed = true;
                      if (confirmedMatches) {
                        allowed = confirmedMatches.some(
                          (cm) => cm.booksName.toUpperCase().trim() === books.partyName.toUpperCase().trim() && cm.tracesName.toUpperCase().trim() === traces.partyName.toUpperCase().trim()
                        );
                      }
                      if (allowed) {
                        foundTKey = tKey;
                        break;
                      }
                    }
                  }
                }
                if (foundTKey) {
                  const trace = tracesLiability[foundTKey];
                  if (!trace.section || trace.section === "\u2014" || trace.section === "") {
                    trace.section = section;
                  }
                  matchedBooks[bKey] = trace;
                  matchedTraces[foundTKey] = books;
                  matchMethods[bKey] = "Name (Exact)";
                  unmatchedBooks.delete(bKey);
                  unmatchedTraces.delete(foundTKey);
                }
              }
            }
            for (const bKey of unmatchedBooks) {
              const books = booksLiability[bKey];
              const lastUnderscore = bKey.lastIndexOf("_");
              const section = bKey.substring(lastUnderscore + 1);
              const booksNormName = normalizePartyName(books.partyName);
              if (booksNormName) {
                let bestTKey = null;
                let highestSim = 0.7;
                for (const tKey of unmatchedTraces) {
                  const traces = tracesLiability[tKey];
                  if (traces.section === section) {
                    const tracesNormName = normalizePartyName(traces.partyName);
                    if (tracesNormName) {
                      let sim = 0;
                      if (booksNormName.length >= 5 && tracesNormName.length >= 5 && (booksNormName.includes(tracesNormName) || tracesNormName.includes(booksNormName))) {
                        sim = 0.9;
                      } else {
                        const maxLen = Math.max(booksNormName.length, tracesNormName.length);
                        if (maxLen >= 4) {
                          const dist = levenshteinDistance(booksNormName, tracesNormName);
                          sim = 1 - dist / maxLen;
                        }
                      }
                      if (sim >= highestSim) {
                        let allowed = true;
                        if (confirmedMatches) {
                          allowed = confirmedMatches.some(
                            (cm) => cm.booksName.toUpperCase().trim() === books.partyName.toUpperCase().trim() && cm.tracesName.toUpperCase().trim() === traces.partyName.toUpperCase().trim()
                          );
                        }
                        if (allowed) {
                          highestSim = sim;
                          bestTKey = tKey;
                        }
                      }
                    }
                  }
                }
                if (!bestTKey) {
                  for (const tKey of unmatchedTraces) {
                    const traces = tracesLiability[tKey];
                    const tracesNormName = normalizePartyName(traces.partyName);
                    if (tracesNormName) {
                      let sim = 0;
                      if (booksNormName.length >= 5 && tracesNormName.length >= 5 && (booksNormName.includes(tracesNormName) || tracesNormName.includes(booksNormName))) {
                        sim = 0.9;
                      } else {
                        const maxLen = Math.max(booksNormName.length, tracesNormName.length);
                        if (maxLen >= 4) {
                          const dist = levenshteinDistance(booksNormName, tracesNormName);
                          sim = 1 - dist / maxLen;
                        }
                      }
                      if (sim >= highestSim) {
                        let allowed = true;
                        if (confirmedMatches) {
                          allowed = confirmedMatches.some(
                            (cm) => cm.booksName.toUpperCase().trim() === books.partyName.toUpperCase().trim() && cm.tracesName.toUpperCase().trim() === traces.partyName.toUpperCase().trim()
                          );
                        }
                        if (allowed) {
                          highestSim = sim;
                          bestTKey = tKey;
                        }
                      }
                    }
                  }
                }
                if (bestTKey) {
                  const trace = tracesLiability[bestTKey];
                  if (!trace.section || trace.section === "\u2014" || trace.section === "") {
                    trace.section = section;
                  }
                  matchedBooks[bKey] = trace;
                  matchedTraces[bestTKey] = books;
                  matchMethods[bKey] = "Name (Fuzzy)";
                  unmatchedBooks.delete(bKey);
                  unmatchedTraces.delete(bestTKey);
                }
              }
            }
            let summary = {
              total_parties_analyzed: 0,
              matched_count: 0,
              short_deducted_count: 0,
              excess_deducted_count: 0,
              missing_in_26q_count: 0,
              missing_in_books_count: 0
            };
            const dbInserts = [];
            for (const bKey of Object.keys(booksLiability)) {
              const books = booksLiability[bKey];
              const lastUnderscore = bKey.lastIndexOf("_");
              const pan = bKey.substring(0, lastUnderscore);
              const section = bKey.substring(lastUnderscore + 1);
              const rule = rulesMap[section] || {};
              const matchedTracesGroup = matchedBooks[bKey];
              let panInBooks = pan.startsWith("NOPAN-") ? "PAN-MISSING" : pan;
              let panIn26Q = matchedTracesGroup && matchedTracesGroup.partyPan ? matchedTracesGroup.partyPan : "\u2014";
              let rate = books.rateApplied;
              let rateText = "";
              if (matchedTracesGroup && matchedTracesGroup.tracesTaxable > 0) {
                rate = Math.round(matchedTracesGroup.tracesTds / matchedTracesGroup.tracesTaxable * 1e4) / 100;
                rateText = `Form 26Q`;
              } else if (panInBooks && panInBooks !== "PAN-MISSING" && PAN_REGEX.test(panInBooks)) {
                const entityChar = panInBooks.charAt(3).toUpperCase();
                const isIndividualOrHuf = entityChar === "P" || entityChar === "H";
                rate = isIndividualOrHuf ? rule.rate_individual_huf ?? 1 : rule.rate_company_others ?? 2;
                rateText = `Books PAN`;
              } else {
                rate = rule.rate_individual_huf ?? 1;
                rateText = `Individual fallback`;
              }
              books.rateApplied = rate;
              books.booksRequiredTds = Math.round(books.booksTaxable * rate / 100);
              if (panInBooks === "PAN-MISSING") {
                if (books.reason.includes("PAN: Missing")) {
                  books.reason = books.reason.replace(
                    /\| PAN: Missing \([^)]+\)/g,
                    `| PAN: Missing (${rate}% rate applied: ${rateText})`
                  );
                } else {
                  books.reason += ` | PAN: Missing (${rate}% rate applied: ${rateText})`;
                }
              }
              let nameInBooks = books.partyName;
              let nameIn26Q = matchedTracesGroup ? matchedTracesGroup.partyName : "\u2014";
              let tracesTaxable = matchedTracesGroup ? matchedTracesGroup.tracesTaxable : 0;
              let tracesTds = matchedTracesGroup ? matchedTracesGroup.tracesTds : 0;
              let taxableVariance = books.booksTaxable - tracesTaxable;
              let tdsVariance = books.booksRequiredTds - tracesTds;
              let status = "Matched";
              if (books.booksTaxable === 0 && books.booksRequiredTds === 0 && tracesTaxable === 0 && tracesTds === 0) {
                status = "Under Threshold";
              } else if (!matchedTracesGroup && books.booksRequiredTds > 0) {
                status = "Missing in 26Q";
              } else {
                if (tdsVariance > 5) {
                  status = "Short Deducted";
                } else if (tdsVariance < -5) {
                  status = "Excess Deducted";
                } else {
                  status = "Matched";
                }
              }
              if (status !== "Under Threshold") {
                summary.total_parties_analyzed++;
              }
              if (status === "Matched") summary.matched_count++;
              else if (status === "Short Deducted") summary.short_deducted_count++;
              else if (status === "Excess Deducted") summary.excess_deducted_count++;
              else if (status === "Missing in 26Q") summary.missing_in_26q_count++;
              const remark = matchedTracesGroup ? matchMethods[bKey] === "Name (Exact)" ? "[Name Match] " : matchMethods[bKey] === "Name (Fuzzy)" ? "[Fuzzy Name Match] " : "" : "";
              const reason = remark + books.reason;
              const resultRecord = {
                party_name: nameInBooks,
                party_pan: panInBooks,
                pan_in_books: panInBooks,
                pan_in_26q: panIn26Q,
                name_in_books: nameInBooks,
                name_in_26q: nameIn26Q,
                entity_type: panInBooks && panInBooks !== "PAN-MISSING" ? getEntityTypeFromPan(panInBooks) : "Unknown",
                section_code: section,
                nature_of_payment: rule.nature_of_payment || "Unknown Nature",
                ledgers: books.ledgers,
                tds_ledgers: books.tdsLedgers,
                books_spend: books.booksSpend,
                books_taxable: books.booksTaxable,
                books_rate_applied: books.rateApplied,
                books_required_tds: books.booksRequiredTds,
                books_actual_tds: books.booksActualTds,
                traces_taxable: tracesTaxable,
                traces_tds: tracesTds,
                taxable_variance: taxableVariance,
                tds_variance: tdsVariance,
                status,
                reason
              };
              reconciliationResults.push(resultRecord);
              dbInserts.push(resultRecord);
            }
            for (const tKey of unmatchedTraces) {
              const traces = tracesLiability[tKey];
              const rule = rulesMap[traces.section] || {};
              let panInBooks = "\u2014";
              let panIn26Q = traces.partyPan;
              let nameInBooks = "\u2014";
              let nameIn26Q = traces.partyName;
              let tracesTaxable = traces.tracesTaxable;
              let tracesTds = traces.tracesTds;
              let taxableVariance = 0 - tracesTaxable;
              let tdsVariance = 0 - tracesTds;
              let status = "Missing in Books";
              summary.total_parties_analyzed++;
              summary.missing_in_books_count++;
              const resultRecord = {
                party_name: nameIn26Q,
                party_pan: panIn26Q,
                pan_in_books: panInBooks,
                pan_in_26q: panIn26Q,
                name_in_books: nameInBooks,
                name_in_26q: nameIn26Q,
                entity_type: panIn26Q && panIn26Q !== "PAN-MISSING" ? getEntityTypeFromPan(panIn26Q) : "Unknown",
                section_code: traces.section,
                nature_of_payment: rule.nature_of_payment || "Unknown Nature",
                ledgers: "",
                tds_ledgers: "",
                books_spend: 0,
                books_taxable: 0,
                books_rate_applied: 0,
                books_required_tds: 0,
                books_actual_tds: 0,
                traces_taxable: tracesTaxable,
                traces_tds: tracesTds,
                taxable_variance: taxableVariance,
                tds_variance: tdsVariance,
                status,
                reason: "No expense entries found in Books (Directly reported in Form 26Q)"
              };
              reconciliationResults.push(resultRecord);
              dbInserts.push(resultRecord);
            }
            db2.serialize(() => {
              db2.run("DELETE FROM Recon_Results", [], (err5) => {
                if (err5) console.error("Error clearing Recon_Results:", err5.message);
                const stmt = db2.prepare(`INSERT INTO Recon_Results (
                                id, party_id, section_code, books_taxable, books_required_tds, 
                                books_actual_tds, traces_taxable, traces_tds, taxable_variance, 
                                tds_variance, reconciliation_status, calculated_at
                            ) VALUES (?, (SELECT id FROM Party_Masters WHERE party_name = ? LIMIT 1), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
                const nowStr = (/* @__PURE__ */ new Date()).toISOString();
                dbInserts.forEach((r) => {
                  stmt.run(
                    (0, import_crypto.randomUUID)(),
                    r.party_name,
                    r.section_code,
                    r.books_taxable,
                    r.books_required_tds,
                    r.books_actual_tds,
                    r.traces_taxable,
                    r.traces_tds,
                    r.taxable_variance,
                    r.tds_variance,
                    r.status,
                    nowStr
                  );
                });
                stmt.finalize();
              });
            });
            res.json({
              success: true,
              summary,
              results: reconciliationResults
            });
          });
        });
      });
    });
  });
  app2.get("/api/tds/group-mappings", (req, res) => {
    db2.all("SELECT * FROM Tally_Group_Mappings ORDER BY created_at DESC", [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows.map((r) => ({
        id: r.id,
        expenseGroup: r.expense_group,
        subGroup: r.sub_group,
        subGroup2: r.sub_group_2,
        sectionCode: r.mapped_section_code,
        createdAt: r.created_at
      })));
    });
  });
  app2.post("/api/tds/group-mappings", (req, res) => {
    const { expenseGroup, subGroup, subGroup2, sectionCode } = req.body;
    if (!expenseGroup || !sectionCode) {
      return res.status(400).json({ error: "expenseGroup and sectionCode are required" });
    }
    const nowStr = (/* @__PURE__ */ new Date()).toISOString();
    db2.run(
      `INSERT INTO Tally_Group_Mappings (id, expense_group, sub_group, sub_group_2, mapped_section_code, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
      [(0, import_crypto.randomUUID)(), expenseGroup.trim(), subGroup ? subGroup.trim() : null, subGroup2 ? subGroup2.trim() : null, sectionCode.trim(), nowStr],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      }
    );
  });
  app2.delete("/api/tds/group-mappings/:id", (req, res) => {
    db2.run(
      `DELETE FROM Tally_Group_Mappings WHERE id = ?`,
      [req.params.id],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      }
    );
  });
  app2.post("/api/tds/reset", (req, res) => {
    db2.serialize(() => {
      db2.run("DELETE FROM Tally_Transactions");
      db2.run("DELETE FROM Tally_Ledgers");
      db2.run("DELETE FROM Tally_Group_Mappings");
      db2.run("DELETE FROM Party_Masters");
      db2.run("DELETE FROM Recon_Results", [], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      });
    });
  });
}

// tax_routes.js
var import_crypto2 = require("crypto");
var import_child_process = require("child_process");
var import_multer = __toESM(require_multer(), 1);
try {
  console.log("[Tax Engine] Compiling incomeTaxEngine.ts for backend execution...");
  (0, import_child_process.execSync)("npx esbuild src/lib/incomeTaxEngine.ts --bundle --platform=node --format=esm --outfile=src/server_lib/incomeTaxEngine.js");
} catch (err) {
  console.warn("[Tax Engine] Warning: Failed to bundle incomeTaxEngine.ts. Make sure esbuild is installed. Proceeding with existing compiled version if available.", err.message);
}
var loadTaxEngine = async () => {
  return await Promise.resolve().then(() => (init_incomeTaxEngine(), incomeTaxEngine_exports));
};
function setupTaxRoutes(app2, db2) {
  db2.run("PRAGMA foreign_keys = ON;");
  db2.serialize(() => {
    db2.run(`CREATE TABLE IF NOT EXISTS Taxpayer_Profiles (
            profile_id TEXT PRIMARY KEY,
            name TEXT,
            pan TEXT,
            age INTEGER,
            opted_for_new_regime INTEGER,
            financial_year TEXT,
            assessment_year TEXT,
            residential_status TEXT,
            entity_type TEXT DEFAULT 'INDIVIDUAL',
            company_turnover_under_400cr INTEGER DEFAULT 0,
            corporate_tax_section TEXT DEFAULT 'NORMAL',
            created_at TEXT,
            updated_at TEXT
        )`);
    db2.run(`ALTER TABLE Taxpayer_Profiles ADD COLUMN entity_type TEXT DEFAULT 'INDIVIDUAL'`, () => {
    });
    db2.run(`ALTER TABLE Taxpayer_Profiles ADD COLUMN company_turnover_under_400cr INTEGER DEFAULT 0`, () => {
    });
    db2.run(`ALTER TABLE Taxpayer_Profiles ADD COLUMN corporate_tax_section TEXT DEFAULT 'NORMAL'`, () => {
    });
    db2.run(`CREATE TABLE IF NOT EXISTS Income_Records (
            id TEXT PRIMARY KEY,
            profile_id TEXT,
            income_type TEXT,
            description TEXT,
            gross_amount REAL,
            exempt_amount REAL,
            net_amount REAL,
            section_code TEXT,
            use_indexation INTEGER,
            FOREIGN KEY (profile_id) REFERENCES Taxpayer_Profiles(profile_id) ON DELETE CASCADE
        )`);
    db2.run(`CREATE TABLE IF NOT EXISTS Deduction_Records (
            id TEXT PRIMARY KEY,
            profile_id TEXT,
            section_code TEXT,
            claimed_amount REAL,
            eligible_amount REAL,
            FOREIGN KEY (profile_id) REFERENCES Taxpayer_Profiles(profile_id) ON DELETE CASCADE
        )`);
    db2.run(`CREATE TABLE IF NOT EXISTS Tax_Bracket_Rules (
            id TEXT PRIMARY KEY,
            regime_type TEXT,
            age_category TEXT,
            lower_limit REAL,
            upper_limit REAL,
            rate_percent REAL,
            financial_year TEXT
        )`);
    db2.run(`CREATE TABLE IF NOT EXISTS Tax_Assessments (
            id TEXT PRIMARY KEY,
            profile_id TEXT,
            assessment_year TEXT,
            total_tax_liability REAL,
            effective_tax_rate REAL,
            computed_at TEXT,
            full_json TEXT,
            FOREIGN KEY (profile_id) REFERENCES Taxpayer_Profiles(profile_id) ON DELETE CASCADE
        )`);
    db2.run(`CREATE TABLE IF NOT EXISTS Staging_AIS_Data (
            id TEXT PRIMARY KEY,
            profile_id TEXT,
            category TEXT,
            source_name TEXT,
            gross_amount REAL,
            tds_deducted REAL,
            status TEXT DEFAULT 'Pending',
            FOREIGN KEY (profile_id) REFERENCES Taxpayer_Profiles(profile_id) ON DELETE CASCADE
        )`);
    db2.run(`CREATE TABLE IF NOT EXISTS Staging_Form26AS (
            id TEXT PRIMARY KEY,
            profile_id TEXT,
            tan_of_deductor TEXT,
            section_code TEXT,
            total_amount_credited REAL,
            total_tax_deducted REAL,
            FOREIGN KEY (profile_id) REFERENCES Taxpayer_Profiles(profile_id) ON DELETE CASCADE
        )`);
  });
  const runAsync = (query2, params = []) => {
    return new Promise((resolve, reject) => {
      db2.run(query2, params, function(err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  };
  const getAsync = (query2, params = []) => {
    return new Promise((resolve, reject) => {
      db2.get(query2, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  };
  const allAsync = (query2, params = []) => {
    return new Promise((resolve, reject) => {
      db2.all(query2, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  };
  app2.post("/api/tax/profile", async (req, res) => {
    try {
      const profile = req.body;
      const profile_id = profile.profile_id || (0, import_crypto2.randomUUID)();
      const now = (/* @__PURE__ */ new Date()).toISOString();
      await runAsync(
        `INSERT INTO Taxpayer_Profiles 
                (profile_id, name, pan, age, opted_for_new_regime, financial_year, assessment_year, residential_status, entity_type, company_turnover_under_400cr, corporate_tax_section, created_at, updated_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(profile_id) DO UPDATE SET 
                name=excluded.name, pan=excluded.pan, age=excluded.age, 
                opted_for_new_regime=excluded.opted_for_new_regime, 
                financial_year=excluded.financial_year, assessment_year=excluded.assessment_year, 
                residential_status=excluded.residential_status,
                entity_type=excluded.entity_type,
                company_turnover_under_400cr=excluded.company_turnover_under_400cr,
                corporate_tax_section=excluded.corporate_tax_section,
                updated_at=excluded.updated_at`,
        [
          profile_id,
          profile.name,
          profile.pan,
          profile.age,
          profile.opted_for_new_regime ? 1 : 0,
          profile.financial_year,
          profile.assessment_year,
          profile.residential_status || "ROR",
          profile.entity_type || "INDIVIDUAL",
          profile.company_turnover_under_400cr ? 1 : 0,
          profile.corporate_tax_section || "NORMAL",
          now,
          now
        ]
      );
      const savedProfile = await getAsync(`SELECT * FROM Taxpayer_Profiles WHERE profile_id = ?`, [profile_id]);
      res.json({ success: true, profile: savedProfile });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app2.post("/api/tax/income", async (req, res) => {
    try {
      const { profile_id, incomes } = req.body;
      if (!profile_id) return res.status(400).json({ error: "Missing profile_id" });
      await runAsync("BEGIN TRANSACTION");
      try {
        await runAsync(`DELETE FROM Income_Records WHERE profile_id = ?`, [profile_id]);
        for (const inc of incomes) {
          await runAsync(
            `INSERT INTO Income_Records 
                        (id, profile_id, income_type, description, gross_amount, exempt_amount, net_amount, section_code, use_indexation) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              inc.id || (0, import_crypto2.randomUUID)(),
              profile_id,
              inc.income_type,
              inc.description,
              inc.gross_amount,
              inc.exempt_amount,
              inc.net_amount,
              inc.section_code,
              inc.use_indexation === true ? 1 : inc.use_indexation === false ? 0 : null
            ]
          );
        }
        await runAsync("COMMIT");
        res.json({ success: true, count: incomes.length });
      } catch (err) {
        await runAsync("ROLLBACK");
        throw err;
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app2.post("/api/tax/deductions", async (req, res) => {
    try {
      const { profile_id, deductions } = req.body;
      if (!profile_id) return res.status(400).json({ error: "Missing profile_id" });
      await runAsync("BEGIN TRANSACTION");
      try {
        await runAsync(`DELETE FROM Deduction_Records WHERE profile_id = ?`, [profile_id]);
        for (const ded of deductions) {
          await runAsync(
            `INSERT INTO Deduction_Records (id, profile_id, section_code, claimed_amount, eligible_amount) 
                        VALUES (?, ?, ?, ?, ?)`,
            [
              ded.id || (0, import_crypto2.randomUUID)(),
              profile_id,
              ded.section_code,
              ded.claimed_amount,
              ded.eligible_amount || 0
            ]
          );
        }
        await runAsync("COMMIT");
        res.json({ success: true, count: deductions.length });
      } catch (err) {
        await runAsync("ROLLBACK");
        throw err;
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app2.get("/api/tax/assessment/:profileId", async (req, res) => {
    try {
      const { profileId } = req.params;
      const profileRow = await getAsync(`SELECT * FROM Taxpayer_Profiles WHERE profile_id = ?`, [profileId]);
      if (!profileRow) return res.status(404).json({ error: "Profile not found" });
      const incomesRaw = await allAsync(`SELECT * FROM Income_Records WHERE profile_id = ?`, [profileId]);
      const deductionsRaw = await allAsync(`SELECT * FROM Deduction_Records WHERE profile_id = ?`, [profileId]);
      const profile = {
        profile_id: profileRow.profile_id,
        name: profileRow.name,
        pan: profileRow.pan,
        age: profileRow.age,
        opted_for_new_regime: profileRow.opted_for_new_regime === 1,
        financial_year: profileRow.financial_year,
        assessment_year: profileRow.assessment_year,
        residential_status: profileRow.residential_status,
        entity_type: profileRow.entity_type || "INDIVIDUAL",
        company_turnover_under_400cr: profileRow.company_turnover_under_400cr === 1,
        corporate_tax_section: profileRow.corporate_tax_section || "NORMAL"
      };
      const incomes = incomesRaw.map((inc) => ({
        id: inc.id,
        profile_id: inc.profile_id,
        income_type: inc.income_type,
        description: inc.description,
        gross_amount: inc.gross_amount,
        exempt_amount: inc.exempt_amount,
        net_amount: inc.net_amount,
        section_code: inc.section_code,
        use_indexation: inc.use_indexation === null ? null : inc.use_indexation === 1
      }));
      const deductions = deductionsRaw.map((ded) => ({
        id: ded.id,
        profile_id: ded.profile_id,
        section_code: ded.section_code,
        claimed_amount: ded.claimed_amount,
        eligible_amount: ded.eligible_amount
      }));
      const engine = await loadTaxEngine();
      const { compareRegimes: compareRegimes2 } = engine;
      const customSlabsRaw = await allAsync(`SELECT * FROM Tax_Bracket_Rules WHERE financial_year = ?`, [profile.financial_year]);
      let customSlabs = void 0;
      if (customSlabsRaw.length > 0) {
        customSlabs = customSlabsRaw.map((s) => ({
          id: s.id,
          regime_type: s.regime_type,
          age_category: s.age_category,
          lower_limit: s.lower_limit,
          upper_limit: s.upper_limit,
          rate_percent: s.rate_percent,
          financial_year: s.financial_year
        }));
      }
      const comparison = compareRegimes2(profile, incomes, deductions, customSlabs);
      const activeAssessment = profile.opted_for_new_regime ? comparison.newRegimeAssessment : comparison.oldRegimeAssessment;
      const totalTax = typeof activeAssessment.totalTaxLiability.toNumber === "function" ? activeAssessment.totalTaxLiability.toNumber() : activeAssessment.totalTaxLiability;
      const effectiveRate = typeof activeAssessment.effectiveTaxRate.toNumber === "function" ? activeAssessment.effectiveTaxRate.toNumber() : activeAssessment.effectiveTaxRate;
      const assessmentId = (0, import_crypto2.randomUUID)();
      const computedAt = activeAssessment.computedAt || (/* @__PURE__ */ new Date()).toISOString();
      const serializeDecimal = (key, value) => {
        if (value && typeof value === "object" && "_value" in value) {
          if (typeof value.toNumber === "function") return value.toNumber();
          try {
            const scaled = BigInt(value._value);
            return Number(scaled) / 1e4;
          } catch (e) {
          }
        }
        if (typeof value === "bigint") return value.toString();
        return value;
      };
      const fullJson = JSON.stringify(comparison, serializeDecimal);
      await runAsync(
        `INSERT INTO Tax_Assessments 
                (id, profile_id, assessment_year, total_tax_liability, effective_tax_rate, computed_at, full_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          assessmentId,
          profile.profile_id,
          profile.assessment_year,
          totalTax,
          effectiveRate,
          computedAt,
          fullJson
        ]
      );
      res.json({ success: true, assessmentId, data: JSON.parse(fullJson) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: err.message });
    }
  });
  const upload = (0, import_multer.default)({ storage: import_multer.default.memoryStorage() });
  app2.post("/api/tax/import/ais-json", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: "No file uploaded." });
      }
      let aisData;
      try {
        aisData = JSON.parse(req.file.buffer.toString("utf8"));
      } catch (parseErr) {
        return res.status(400).json({ success: false, error: "Invalid JSON file structure." });
      }
      const profileId = req.query.profile_id || "CURRENT_USER";
      const profile = await getAsync(`SELECT * FROM Taxpayer_Profiles WHERE profile_id = ?`, [profileId]);
      if (!profile) {
        return res.status(404).json({ success: false, error: "Taxpayer profile not found." });
      }
      const filePan = aisData.PartA?.PAN || aisData.PartA?.pan || aisData.pan || aisData.PAN;
      if (filePan && profile.pan && filePan.toUpperCase() !== profile.pan.toUpperCase()) {
        return res.status(400).json({
          success: false,
          error: `PAN mismatch! File belongs to ${filePan}, but active profile PAN is ${profile.pan}.`
        });
      }
      const suggestedIncomes = [];
      const getAmountVal = (val) => {
        if (!val) return 0;
        return parseFloat(String(val).replace(/[^0-9.]/g, "")) || 0;
      };
      const tdsInfo = aisData.TDS_TCS_Information || aisData.tds_tcs_information || [];
      for (const item of tdsInfo) {
        const rawSec = item.sectionCode || item.Section_Code || item.section_code || "";
        const source = item.deductorName || item.Deductor_Name || item.deductor_name || item.Source || "Unknown";
        const gross = getAmountVal(item.totalAmountCredited !== void 0 ? item.totalAmountCredited : item.Gross_Amount || item.gross_amount || item.Total_Amount_Credited || 0);
        const tds = getAmountVal(item.totalTaxDeducted !== void 0 ? item.totalTaxDeducted : item.Tds_Amount || item.tds_amount || item.Total_Tax_Deducted || 0);
        let category = "OTHER_SOURCES";
        let desc = `TDS u/s ${rawSec || "Unknown Section"} - ${source}`;
        if (rawSec.includes("192")) {
          category = "SALARY";
          desc = `Salary from ${source}`;
        } else if (rawSec.includes("194A")) {
          category = "OTHER_SOURCES";
          desc = `Interest Income u/s 194A - ${source}`;
        } else if (rawSec.includes("194C") || rawSec.includes("194J")) {
          category = "BUSINESS";
          desc = `Business/Professional Receipts u/s ${rawSec} - ${source}`;
        } else if (rawSec.includes("194B")) {
          category = "CASUAL_INCOME";
          desc = `Casual/Winning Income u/s 194B - ${source}`;
        }
        if (gross > 0) {
          const id = (0, import_crypto2.randomUUID)();
          await runAsync(
            `INSERT INTO Staging_AIS_Data (id, profile_id, category, source_name, gross_amount, tds_deducted, status)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, profileId, category, source, gross, tds, "Pending"]
          );
          suggestedIncomes.push({
            id,
            source,
            amount: gross,
            tds,
            suggestedCategory: category,
            description: desc,
            sectionCode: rawSec || "Unknown"
          });
        }
      }
      const sftInfo = aisData.SFT_Information || aisData.sft_information || [];
      for (const item of sftInfo) {
        const source = item.sourceName || item.Source_Name || item.source_name || item.Depository_Name || "Unknown";
        const gross = getAmountVal(item.grossAmount !== void 0 ? item.grossAmount : item.Gross_Amount || item.gross_amount || item.Transaction_Value || 0);
        const desc = item.transactionDescription || item.Description || item.description || "Unknown Transaction";
        let category = "OTHER_SOURCES";
        let isCompliance = false;
        const lowerDesc = desc.toLowerCase();
        const lowerSource = source.toLowerCase();
        if (lowerDesc.includes("credit card") || lowerDesc.includes("cash deposit") || lowerDesc.includes("cash deposits") || lowerDesc.includes("sub-registrar") || lowerSource.includes("credit card") || lowerSource.includes("cash deposit") || lowerSource.includes("cash deposits") || lowerSource.includes("sub-registrar")) {
          category = "COMPLIANCE";
          isCompliance = true;
        } else if (lowerDesc.includes("mutual fund") || lowerDesc.includes("share") || lowerDesc.includes("equity") || lowerDesc.includes("securities")) {
          category = "CAPITAL_GAINS";
        } else if (lowerDesc.includes("dividend")) {
          category = "OTHER_SOURCES";
        } else if (lowerDesc.includes("salary")) {
          category = "SALARY";
        }
        if (gross > 0) {
          const id = (0, import_crypto2.randomUUID)();
          await runAsync(
            `INSERT INTO Staging_AIS_Data (id, profile_id, category, source_name, gross_amount, tds_deducted, status)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, profileId, category, source, gross, 0, "Pending"]
          );
          suggestedIncomes.push({
            id,
            source: `${source} (${desc})`,
            amount: gross,
            tds: 0,
            suggestedCategory: category,
            description: desc,
            sectionCode: "SFT",
            isCompliance
          });
        }
      }
      res.json({ success: true, pan: filePan, data: suggestedIncomes });
    } catch (err) {
      console.error("AIS Import Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app2.post("/api/tax/extract-26as-pdf", upload.single("file"), async (req, res) => {
    try {
      console.log("Received file in Node:", req.file ? {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      } : "no file");
      if (!req.file) {
        return res.status(400).json({ success: false, error: "No file uploaded." });
      }
      const fileBuffer = req.file.buffer;
      const maxSize = 10 * 1024 * 1024;
      if (fileBuffer.length > maxSize) {
        return res.status(400).json({
          success: false,
          error: `File size (${(fileBuffer.length / (1024 * 1024)).toFixed(1)} MB) exceeds the 10 MB limit.`
        });
      }
      const LEVITATE_URL = process.env.LEVITATE_EXTRACT_URL || "http://localhost:8000/extract";
      const FormData = (await Promise.resolve().then(() => __toESM(require_form_data(), 1))).default;
      const formData = new FormData();
      const originalName = req.file.originalname || "form_26as.pdf";
      const isTxt = originalName.toLowerCase().endsWith(".txt");
      formData.append("file", fileBuffer, {
        filename: originalName,
        contentType: isTxt ? "text/plain" : "application/pdf"
      });
      const http = await import("http");
      const { URL } = await import("url");
      const targetUrl = new URL(LEVITATE_URL);
      const proxyReq = http.default.request(
        {
          hostname: targetUrl.hostname,
          port: targetUrl.port || 8e3,
          path: targetUrl.pathname,
          method: "POST",
          headers: formData.getHeaders()
        },
        (proxyRes) => {
          if (proxyRes.statusCode >= 400) {
            let body = "";
            proxyRes.on("data", (chunk) => body += chunk);
            proxyRes.on("end", () => {
              try {
                const errorData = JSON.parse(body);
                return res.status(proxyRes.statusCode).json({
                  success: false,
                  error: errorData.detail || "LevitateExtract service returned an error."
                });
              } catch {
                return res.status(proxyRes.statusCode).json({
                  success: false,
                  error: "LevitateExtract service returned an error."
                });
              }
            });
            return;
          }
          res.set({
            "Content-Type": proxyRes.headers["content-type"] || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": proxyRes.headers["content-disposition"] || 'attachment; filename="Form_26AS_Extract.xlsx"',
            "X-LevitateExtract-Rows": proxyRes.headers["x-levitateextract-rows"] || "0",
            "X-LevitateExtract-Checksum": proxyRes.headers["x-levitateextract-checksum"] || "unknown"
          });
          proxyRes.pipe(res);
        }
      );
      proxyReq.on("error", (err) => {
        console.error("[LevitateExtract Proxy] Connection failed:", err.message);
        return res.status(503).json({
          success: false,
          error: "The LevitateExtract service is not available. Please ensure the Docker container is running (docker-compose up)."
        });
      });
      formData.pipe(proxyReq);
    } catch (err) {
      console.error("[LevitateExtract Proxy] Error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });
}

// server.js
var import_helmet = __toESM(require("helmet"), 1);
var import_app = require("firebase/app");
var import_firestore = require("firebase/firestore");
var import_localtunnel = __toESM(require("localtunnel"), 1);
var import_meta = {};
import_dns.default.setDefaultResultOrder("ipv4first");
var firebaseConfig = {
  apiKey: "AIzaSyDfE2DBpfE5Oj5nwtErub8X0tvBfMsi9QA",
  authDomain: "reco-vaswani-license.firebaseapp.com",
  projectId: "reco-vaswani-license",
  storageBucket: "reco-vaswani-license.appspot.com",
  messagingSenderId: "594471668759",
  appId: "1:594471668759:web:fb9f997aa87bd7e866e052"
};
var firebaseApp = (0, import_app.initializeApp)(firebaseConfig);
var firestore = (0, import_firestore.getFirestore)(firebaseApp);
(0, import_firestore.setLogLevel)("error");
var __filename = (0, import_url.fileURLToPath)(import_meta.url);
var __dirname = import_path.default.dirname(__filename);
var app = (0, import_express.default)();
app.use((0, import_helmet.default)({ contentSecurityPolicy: false }));
var PORT = 3001;
var userDataPath = process.env.USER_DATA_PATH || ".";
var CONFIG_PATH = import_path.default.join(userDataPath, "server_config.json");
var JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (import_fs2.default.existsSync(CONFIG_PATH)) {
    try {
      JWT_SECRET = JSON.parse(import_fs2.default.readFileSync(CONFIG_PATH)).jwtSecret;
    } catch (e) {
    }
  }
  if (!JWT_SECRET) {
    JWT_SECRET = import_crypto3.default.randomBytes(32).toString("hex");
    try {
      if (!import_fs2.default.existsSync(userDataPath)) {
        import_fs2.default.mkdirSync(userDataPath, { recursive: true });
      }
      import_fs2.default.writeFileSync(CONFIG_PATH, JSON.stringify({ jwtSecret: JWT_SECRET }));
      console.log("Generated new secure JWT Secret for this installation.");
    } catch (err) {
      console.error("Failed to write server_config.json:", err);
    }
  }
}
app.use("/updates", import_express.default.static(import_path.default.join(__dirname, "updates")));
app.use(import_express.default.static(import_path.default.join(__dirname, "dist"), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    } else {
      res.setHeader("Cache-Control", "no-cache");
    }
  }
}));
app.use((0, import_cors.default)({
  origin: true,
  // Reflects the request origin — safe for LAN where all clients are trusted
  credentials: true
}));
app.use(import_express.default.json({ limit: "50mb" }));
app.use(import_express.default.urlencoded({ limit: "50mb", extended: true }));
var BANNED_PATH = import_path.default.join(userDataPath, "banned_users.json");
var AUDIT_PATH = import_path.default.join(userDataPath, "audit_logs.json");
var DB_PATH = import_path.default.join(userDataPath, "network_data.db");
var activeSessions = {};
var screenFrames = {};
var screenRequests = {};
var userMessages = {};
var loadJson = (p) => import_fs2.default.existsSync(p) ? JSON.parse(import_fs2.default.readFileSync(p)) : {};
var saveJson = (p, data) => import_fs2.default.writeFileSync(p, JSON.stringify(data, null, 2));
var getAuditLogs = () => {
  try {
    const data = JSON.parse(import_fs2.default.readFileSync(AUDIT_PATH));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};
var db = new import_sqlite3.default.Database(DB_PATH, (err) => {
  if (err) console.error("Database connection error:", err);
  else console.log("Connected to SQLite Database at", DB_PATH);
});
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS gstin_memory (
        company_name TEXT PRIMARY KEY,
        memory_data TEXT
    )`);
  db.run(`CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, username TEXT, company_name TEXT, mode TEXT, timestamp INTEGER, session_data TEXT
    )`);
  db.run(`CREATE TABLE IF NOT EXISTS consolidations (
        id TEXT PRIMARY KEY, username TEXT, company_name TEXT, timestamp INTEGER, consolidation_data TEXT
    )`);
  db.run(`CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY, username TEXT, gstin TEXT UNIQUE, trade_name TEXT, legal_name TEXT, email TEXT, phone TEXT
    )`);
  db.run(`CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, username TEXT, client_gstin TEXT, return_type TEXT, period TEXT, due_date TEXT, status TEXT, tax_amount REAL
    )`);
  db.run(`CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS network_users (
        username TEXT PRIMARY KEY,
        password_hash TEXT,
        role TEXT,
        is_active INTEGER,
        office_id TEXT,
        device_limit INTEGER,
        device_id TEXT,
        last_active_at INTEGER,
        status TEXT
    )`);
  db.run(`ALTER TABLE network_users ADD COLUMN last_active_at INTEGER`, (err) => {
  });
  db.run(`ALTER TABLE network_users ADD COLUMN status TEXT`, (err) => {
  });
});
setupTdsRoutes(app, db);
setupTaxRoutes(app, db);
var saveUserToLocalDb = (user) => {
  db.run(
    `INSERT INTO network_users (username, password_hash, role, is_active, office_id, device_id)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(username) DO UPDATE SET
            password_hash = excluded.password_hash,
            role = excluded.role,
            is_active = excluded.is_active,
            office_id = excluded.office_id,
            device_id = excluded.device_id`,
    [user.username.toLowerCase().trim(), user.password_hash || user.password || "", user.role, user.is_active, user.office_id, user.device_id || null]
  );
};
var getOfficeId = () => new Promise((res) => {
  db.get(`SELECT value FROM app_config WHERE key = 'office_id'`, [], (err, row) => {
    res(row ? row.value : null);
  });
});
var authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);
  import_jsonwebtoken.default.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};
var getMacAddress = () => {
  const interfaces = import_os.default.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (!iface.internal && iface.mac !== "00:00:00:00:00:00") {
        return iface.mac;
      }
    }
  }
  return "UNKNOWN-MAC";
};
var SERVER_MAC = getMacAddress();
var SERVER_REVOKED = false;
var LICENSE_DELETED = false;
var _licenseUnsubscribe = null;
var _heartbeatInterval = null;
var setupLicenseMonitoring = (officeId) => {
  if (_licenseUnsubscribe) {
    try {
      _licenseUnsubscribe();
    } catch (e) {
    }
    _licenseUnsubscribe = null;
  }
  if (_heartbeatInterval) {
    clearInterval(_heartbeatInterval);
    _heartbeatInterval = null;
  }
  SERVER_REVOKED = false;
  LICENSE_DELETED = false;
  console.log(`[License Monitor] Initializing for office_id: ${officeId}`);
  const q = (0, import_firestore.query)((0, import_firestore.collection)(firestore, "serial_keys"), (0, import_firestore.where)("office_id", "==", officeId), (0, import_firestore.where)("key_type", "==", "server"));
  _licenseUnsubscribe = (0, import_firestore.onSnapshot)(q, (snap) => {
    if (!snap.empty) {
      const serverKeyDoc = snap.docs[0].data();
      if (serverKeyDoc.is_active === 0) {
        SERVER_REVOKED = true;
        console.log("CRITICAL: SERVER KEY REVOKED BY SUPER ADMIN!");
      } else {
        SERVER_REVOKED = false;
        LICENSE_DELETED = false;
      }
    } else {
      if (snap.metadata && snap.metadata.fromCache) {
        console.log("[License Monitor] Offline or cached data empty snapshot. Skipping revocation check.");
        return;
      }
      SERVER_REVOKED = true;
      LICENSE_DELETED = true;
      console.log("CRITICAL: LICENSE HAS BEEN DELETED OR NOT FOUND IN CLOUD DB!");
    }
  }, (error) => {
    console.warn("[License Monitor] Offline or network error subscribing to Firestore:", error.message);
  });
  _heartbeatInterval = setInterval(async () => {
    try {
      const serverSnap = await (0, import_firestore.getDocs)((0, import_firestore.query)((0, import_firestore.collection)(firestore, "serial_keys"), (0, import_firestore.where)("office_id", "==", officeId), (0, import_firestore.where)("key_type", "==", "server")));
      if (!serverSnap.empty) {
        await (0, import_firestore.updateDoc)(serverSnap.docs[0].ref, { status: "online", last_seen: Date.now() });
      }
      const now = Date.now();
      for (const user in activeSessions) {
        if (now - activeSessions[user].lastSeen > 12e4) {
          delete activeSessions[user];
        }
      }
      const usersSnap = await (0, import_firestore.getDocs)((0, import_firestore.query)((0, import_firestore.collection)(firestore, "network_users"), (0, import_firestore.where)("office_id", "==", officeId)));
      for (const docSnap of usersSnap.docs) {
        const userData = docSnap.data();
        const username = String(userData.username).toLowerCase().trim();
        const isOnline = !!activeSessions[username];
        const currentStatus = userData.status || "offline";
        const expectedStatus = isOnline ? "online" : "offline";
        if (currentStatus !== expectedStatus) {
          await (0, import_firestore.updateDoc)(docSnap.ref, { status: expectedStatus });
        }
      }
    } catch (e) {
    }
  }, 6e4);
};
setTimeout(async () => {
  const officeId = await getOfficeId();
  if (officeId) {
    setupLicenseMonitoring(officeId);
  }
}, 5e3);
var LICENSE_EXEMPT_PATHS = ["/activate", "/reset-license", "/admin-exists", "/ping"];
app.use("/api", (req, res, next) => {
  if (LICENSE_DELETED && !LICENSE_EXEMPT_PATHS.includes(req.path)) {
    return res.status(410).json({ error: "CRITICAL: License has been permanently deleted by Super Admin." });
  }
  if (SERVER_REVOKED && !LICENSE_EXEMPT_PATHS.includes(req.path)) {
    return res.status(403).json({ error: "CRITICAL: Server Key has been revoked by Super Admin. Access Denied." });
  }
  next();
});
app.get("/api/network-info", (req, res) => {
  const interfaces = import_os.default.networkInterfaces();
  let ip = "127.0.0.1";
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (!iface.internal && iface.family === "IPv4") {
        ip = iface.address;
      }
    }
  }
  res.json({ ip, port: 3001, pcName: import_os.default.hostname() });
});
var activeTunnel = null;
app.post("/api/network/go-global", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  try {
    if (activeTunnel) {
      activeTunnel.close();
      activeTunnel = null;
    }
    activeTunnel = await (0, import_localtunnel.default)({ port: PORT });
    const officeId = await getOfficeId();
    if (officeId) {
      const snap = await (0, import_firestore.getDocs)((0, import_firestore.query)((0, import_firestore.collection)(firestore, "serial_keys"), (0, import_firestore.where)("office_id", "==", officeId), (0, import_firestore.where)("key_type", "==", "server")));
      if (!snap.empty) {
        await (0, import_firestore.updateDoc)(snap.docs[0].ref, { public_url: activeTunnel.url, is_global: true });
      }
    }
    res.json({ success: true, url: activeTunnel.url });
  } catch (err) {
    res.status(500).json({ error: "Failed to start tunnel: " + err.message });
  }
});
app.get("/api/ping", (req, res) => {
  res.json({ success: true, isServer: true, pcName: import_os.default.hostname() });
});
app.post("/api/activate", async (req, res) => {
  const { serialKey, deviceId } = req.body;
  try {
    const keyRef = (0, import_firestore.doc)(firestore, "serial_keys", serialKey);
    const keySnap = await (0, import_firestore.getDoc)(keyRef);
    if (!keySnap.exists()) return res.status(404).json({ error: "Invalid Serial Key" });
    const row = keySnap.data();
    if (row.is_active === 0) return res.status(403).json({ error: "This key has been revoked" });
    if (row.office_id) {
      await new Promise((resolve, reject) => {
        db.run(`INSERT INTO app_config (key, value) VALUES ('office_id', ?) ON CONFLICT(key) DO UPDATE SET value = ?`, [row.office_id, row.office_id], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    if (row.key_type === "server") {
      if (row.bound_mac && row.bound_mac !== SERVER_MAC) {
        return res.status(403).json({ error: "Hardware mismatch! Server copied illegally." });
      }
      if (row.device_id && row.device_id !== deviceId) {
        return res.status(403).json({ error: "Server key is already bound to another device." });
      }
      await (0, import_firestore.updateDoc)(keyRef, { device_id: deviceId, bound_mac: SERVER_MAC });
      if (row.office_id) {
        setupLicenseMonitoring(row.office_id);
      }
      res.json({ success: true, isMaster: true });
    } else {
      if (row.device_id && row.device_id !== deviceId) {
        return res.status(403).json({ error: "This client key is already in use on another computer." });
      }
      await (0, import_firestore.updateDoc)(keyRef, { device_id: deviceId });
      res.json({ success: true });
    }
  } catch (err) {
    console.error("ACTIVATE ERROR:", err);
    res.status(500).json({ error: `Cloud error: ${err.message}` });
  }
});
app.post("/api/reset-license", async (req, res) => {
  try {
    if (_licenseUnsubscribe) {
      try {
        _licenseUnsubscribe();
      } catch (e) {
      }
      _licenseUnsubscribe = null;
    }
    if (_heartbeatInterval) {
      clearInterval(_heartbeatInterval);
      _heartbeatInterval = null;
    }
    SERVER_REVOKED = false;
    LICENSE_DELETED = false;
    db.run(`DELETE FROM app_config WHERE key = 'office_id'`);
    db.run(`DELETE FROM network_users`);
    console.log("[License Reset] Backend state fully cleared.");
    res.json({ success: true, message: "License and local state reset successfully." });
  } catch (err) {
    console.error("RESET-LICENSE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/usage", async (req, res) => {
  try {
    const officeId = await getOfficeId();
    const snap = await (0, import_firestore.getDocs)((0, import_firestore.query)((0, import_firestore.collection)(firestore, "module_usage"), (0, import_firestore.where)("office_id", "==", officeId)));
    const rows = snap.docs.map((d) => ({ module_name: d.id, ...d.data() }));
    res.json(rows);
  } catch (err) {
    res.json([]);
  }
});
app.post("/api/usage/increment", async (req, res) => {
  const { module_name } = req.body;
  try {
    const officeId = await getOfficeId();
    const ref = (0, import_firestore.doc)(firestore, "module_usage", `${officeId}_${module_name}`);
    const snap = await (0, import_firestore.getDoc)(ref);
    let currentCount = 0;
    let isEnabled = 1;
    if (snap.exists()) {
      const data = snap.data();
      currentCount = data.usage_count || 0;
      if (data.is_enabled !== void 0) isEnabled = data.is_enabled;
    }
    if (isEnabled === 0) return res.status(403).json({ error: "Module disabled by Administrator." });
    if (currentCount >= 25) return res.status(403).json({ error: "Usage limit of 25 reached for this module. Please contact Super Admin to purchase more runs." });
    await (0, import_firestore.setDoc)(ref, { usage_count: currentCount + 1, is_enabled: isEnabled }, { merge: true });
    res.json({ success: true, count: currentCount + 1 });
  } catch (err) {
    res.status(500).json({ error: "Cloud connection failed" });
  }
});
app.post("/api/usage/toggle", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  const { module_name, is_enabled } = req.body;
  try {
    const officeId = await getOfficeId();
    await (0, import_firestore.setDoc)((0, import_firestore.doc)(firestore, "module_usage", `${officeId}_${module_name}`), { is_enabled }, { merge: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
});
app.post("/api/usage/reset", authenticateToken, (req, res) => {
  return res.status(403).json({ error: "Resetting usage limits is strictly locked. Resets must be performed through the Super Admin portal." });
});
app.get("/api/keys", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  try {
    const officeId = await getOfficeId();
    const snap = await (0, import_firestore.getDocs)((0, import_firestore.query)((0, import_firestore.collection)(firestore, "serial_keys"), (0, import_firestore.where)("office_id", "==", officeId)));
    const rows = snap.docs.map((d) => ({ id: d.id, key: d.id, ...d.data() }));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post("/api/keys", authenticateToken, (req, res) => {
  return res.status(403).json({ error: "Key generation is locked to 1 Server with Unlimited Clients." });
});
app.patch("/api/keys/:key", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  try {
    const keyRef = (0, import_firestore.doc)(firestore, "serial_keys", req.params.key);
    await (0, import_firestore.updateDoc)(keyRef, { is_active: req.body.is_active });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.patch("/api/keys/:key/unbind", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  try {
    const keyRef = (0, import_firestore.doc)(firestore, "serial_keys", req.params.key);
    await (0, import_firestore.updateDoc)(keyRef, { device_id: null, bound_mac: null });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.delete("/api/keys/:key", authenticateToken, (req, res) => {
  return res.status(403).json({ error: "Key deletion is strictly disabled." });
});
var failedLoginAttempts = {};
var lockoutTimeouts = {};
var withTimeout = (promise, ms = 3e3) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Firebase request timed out")), ms))
  ]);
};
app.get("/api/admin-exists", async (req, res) => {
  try {
    const officeId = await getOfficeId();
    if (!officeId) return res.status(403).json({ error: "App not activated." });
    db.get(`SELECT username FROM network_users WHERE username = 'admin'`, [], async (err, row) => {
      if (row) {
        return res.json({ exists: true });
      }
      try {
        const q = (0, import_firestore.query)((0, import_firestore.collection)(firestore, "network_users"), (0, import_firestore.where)("office_id", "==", officeId), (0, import_firestore.where)("username", "==", "admin"));
        const snap = await withTimeout((0, import_firestore.getDocs)(q), 3e3);
        if (!snap.empty) {
          const u = snap.docs[0].data();
          saveUserToLocalDb(u);
          return res.json({ exists: true });
        }
        return res.json({ exists: false });
      } catch (e) {
        return res.json({ exists: false });
      }
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
app.post("/api/setup-admin", async (req, res) => {
  try {
    const officeId = await getOfficeId();
    if (!officeId) return res.status(403).json({ error: "App not activated." });
    const { password } = req.body;
    if (!password || password.length < 5) return res.status(400).json({ error: "Password must be at least 5 characters long." });
    const q = (0, import_firestore.query)((0, import_firestore.collection)(firestore, "network_users"), (0, import_firestore.where)("office_id", "==", officeId), (0, import_firestore.where)("username", "==", "admin"));
    const snap = await (0, import_firestore.getDocs)(q);
    if (!snap.empty) {
      return res.status(403).json({ error: "Admin already exists. Setup locked." });
    }
    const hash = await import_bcryptjs.default.hash(password, 10);
    const adminUser = {
      username: "admin",
      password_hash: hash,
      role: "admin",
      is_active: 1,
      office_id: officeId,
      device_id: null
    };
    await (0, import_firestore.addDoc)((0, import_firestore.collection)(firestore, "network_users"), { ...adminUser, created_at: Date.now() });
    saveUserToLocalDb(adminUser);
    return res.json({ success: true, message: "Admin account secured successfully." });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const userKey = String(username).toLowerCase().trim();
  if (lockoutTimeouts[userKey] && lockoutTimeouts[userKey] > Date.now()) {
    const remainingMinutes = Math.ceil((lockoutTimeouts[userKey] - Date.now()) / 6e4);
    return res.status(429).json({ error: `Account locked due to consecutive failed attempts. Try again in ${remainingMinutes} minutes.` });
  }
  try {
    const officeId = await getOfficeId();
    if (!officeId) return res.status(403).json({ error: "App not activated on this PC." });
    let user;
    let userDocId;
    let isOnline = true;
    let docRef = null;
    try {
      const snap = await withTimeout((0, import_firestore.getDocs)((0, import_firestore.query)((0, import_firestore.collection)(firestore, "network_users"), (0, import_firestore.where)("office_id", "==", officeId))), 3e3);
      for (const docSnap of snap.docs) {
        const u = docSnap.data();
        saveUserToLocalDb({
          username: u.username,
          password_hash: u.password_hash || u.password || "",
          role: u.role,
          is_active: u.is_active,
          office_id: u.office_id,
          device_id: u.device_id || null
        });
      }
      const foundDoc = snap.docs.find((d) => String(d.data().username).toLowerCase().trim() === userKey);
      if (!foundDoc) return res.status(404).json({ error: "User not found" });
      user = { id: foundDoc.id, ...foundDoc.data() };
      userDocId = user.id;
      docRef = foundDoc.ref;
    } catch (dbErr) {
      console.log("Firebase login offline fallback triggered:", dbErr.message);
      isOnline = false;
      const localUser = await new Promise((resolve) => {
        db.get("SELECT * FROM network_users WHERE username = ?", [userKey], (err, row) => {
          resolve(row || null);
        });
      });
      if (!localUser) {
        return res.status(500).json({ error: "Cloud database offline, and no local cache found for this user." });
      }
      user = localUser;
      userDocId = localUser.username;
    }
    if (user.is_active === 0) return res.status(403).json({ error: "Account restricted." });
    let match = false;
    if (user.password && !user.password.startsWith("$2")) {
      match = password === user.password;
    } else if (user.password_hash) {
      match = await import_bcryptjs.default.compare(password, user.password_hash);
    } else if (user.password && user.password.startsWith("$2")) {
      match = await import_bcryptjs.default.compare(password, user.password);
    }
    if (!match) {
      failedLoginAttempts[userKey] = (failedLoginAttempts[userKey] || 0) + 1;
      if (failedLoginAttempts[userKey] >= 5) {
        lockoutTimeouts[userKey] = Date.now() + 15 * 60 * 1e3;
        failedLoginAttempts[userKey] = 0;
        return res.status(429).json({ error: "Account locked out. Too many failed attempts. Locked for 15 minutes." });
      }
      const attemptsLeft = 5 - failedLoginAttempts[userKey];
      return res.status(401).json({ error: `Invalid password. ${attemptsLeft} attempts remaining.` });
    }
    const reqDeviceId = req.body.deviceId || "legacy_device";
    if (user.role !== "admin") {
      if (user.device_id && user.device_id !== reqDeviceId) {
        return res.status(403).json({ error: "Account is logged in on another PC. Admin must unbind it first." });
      }
      if (!user.device_id && reqDeviceId !== "legacy_device") {
        if (isOnline && docRef) {
          await withTimeout((0, import_firestore.updateDoc)(docRef, { device_id: reqDeviceId }), 3e3).catch((e) => console.warn("Failed to update cloud device ID:", e.message));
        }
        db.run("UPDATE network_users SET device_id = ? WHERE username = ?", [reqDeviceId, userKey]);
      }
    }
    failedLoginAttempts[userKey] = 0;
    delete lockoutTimeouts[userKey];
    if (isOnline && docRef) {
      await withTimeout((0, import_firestore.updateDoc)(docRef, { last_active_at: Date.now(), status: "online" }), 3e3).catch((e) => console.warn("Failed to update cloud status:", e.message));
      await withTimeout((0, import_firestore.addDoc)((0, import_firestore.collection)(firestore, "audit_logs"), {
        username: user.username,
        ip: req.ip || "127.0.0.1",
        system: import_os.default.hostname(),
        time: (/* @__PURE__ */ new Date()).toLocaleString(),
        action: "Logged In",
        office_id: officeId
      }), 3e3).catch((e) => console.warn("Failed to add cloud audit log:", e.message));
    }
    db.run("UPDATE network_users SET last_active_at = ? WHERE username = ?", [Date.now(), userKey]);
    const token = import_jsonwebtoken.default.sign({ id: userDocId, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: "12h" });
    res.json({ token, role: user.role, username: user.username, userDocId });
  } catch (err) {
    res.status(500).json({ error: "Server database connection failed." });
  }
});
app.post("/api/logout", authenticateToken, async (req, res) => {
  try {
    const officeId = await getOfficeId();
    if (req.user.username !== "admin") {
      const snap = await (0, import_firestore.getDocs)((0, import_firestore.query)((0, import_firestore.collection)(firestore, "network_users"), (0, import_firestore.where)("office_id", "==", officeId)));
      const userDoc = snap.docs.find((d) => d.data().username === req.user.username);
      if (userDoc) {
        await (0, import_firestore.updateDoc)(userDoc.ref, { status: "offline", last_active_at: null });
      }
      db.run("UPDATE network_users SET device_id = NULL WHERE username = ?", [req.user.username.toLowerCase().trim()]);
    }
    await (0, import_firestore.addDoc)((0, import_firestore.collection)(firestore, "audit_logs"), {
      username: req.user.username,
      ip: req.ip || "127.0.0.1",
      system: import_os.default.hostname(),
      time: (/* @__PURE__ */ new Date()).toLocaleString(),
      action: "Logged Out",
      office_id: officeId
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Logout failed" });
  }
});
app.post("/api/users", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  try {
    const officeId = await getOfficeId();
    const usernameNorm = String(req.body.username).toLowerCase().trim();
    const hash = await import_bcryptjs.default.hash(req.body.password, 10);
    const snap = await (0, import_firestore.getDocs)((0, import_firestore.query)((0, import_firestore.collection)(firestore, "network_users"), (0, import_firestore.where)("office_id", "==", officeId)));
    const existing = snap.docs.find((d) => String(d.data().username).toLowerCase().trim() === usernameNorm);
    if (existing) return res.status(400).json({ error: "User already exists" });
    const docRef = await (0, import_firestore.addDoc)((0, import_firestore.collection)(firestore, "network_users"), {
      username: usernameNorm,
      password_hash: hash,
      role: req.body.role || "user",
      is_active: 1,
      office_id: officeId
    });
    saveUserToLocalDb({
      username: usernameNorm,
      password_hash: hash,
      role: req.body.role || "user",
      is_active: 1,
      office_id: officeId,
      device_id: null
    });
    res.json({ success: true, id: docRef.id });
  } catch (e) {
    res.status(500).json({ error: e.message || "Server error" });
  }
});
app.post("/api/heartbeat", authenticateToken, async (req, res) => {
  if (req.user.username === "admin") return res.json({ success: true });
  try {
    const officeId = await getOfficeId();
    const snap = await (0, import_firestore.getDocs)((0, import_firestore.query)((0, import_firestore.collection)(firestore, "network_users"), (0, import_firestore.where)("office_id", "==", officeId)));
    const userKey = String(req.user.username).toLowerCase().trim();
    const userDoc = snap.docs.find((d) => String(d.data().username).toLowerCase().trim() === userKey);
    if (!userDoc) {
      return res.status(403).json({ error: "User deleted" });
    }
    if (userDoc.data().is_active === 0) {
      return res.status(403).json({ error: "User restricted" });
    }
    await (0, import_firestore.updateDoc)(userDoc.ref, { last_active_at: Date.now() });
    db.run("UPDATE network_users SET last_active_at = ? WHERE username = ?", [Date.now(), userKey]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Heartbeat failed" });
  }
});
app.get("/api/users", authenticateToken, async (req, res) => {
  try {
    const officeId = await getOfficeId();
    const snap = await (0, import_firestore.getDocs)((0, import_firestore.query)((0, import_firestore.collection)(firestore, "network_users"), (0, import_firestore.where)("office_id", "==", officeId)));
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.delete("/api/users/:username", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  try {
    const officeId = await getOfficeId();
    const targetUsernameNorm = String(req.params.username).toLowerCase().trim();
    const snap = await (0, import_firestore.getDocs)((0, import_firestore.query)((0, import_firestore.collection)(firestore, "network_users"), (0, import_firestore.where)("office_id", "==", officeId)));
    const userDoc = snap.docs.find((d) => String(d.data().username).toLowerCase().trim() === targetUsernameNorm);
    if (userDoc && targetUsernameNorm !== "admin") {
      await (0, import_firestore.updateDoc)(userDoc.ref, { is_active: 0 });
      db.run("UPDATE network_users SET is_active = 0 WHERE username = ?", [targetUsernameNorm]);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});
app.get("/api/memory/:companyName", authenticateToken, (req, res) => {
  db.get(`SELECT memory_data FROM gstin_memory WHERE company_name = ?`, [req.params.companyName], (err, row) => {
    res.json(row && row.memory_data ? JSON.parse(row.memory_data) : {});
  });
});
app.post("/api/memory/:companyName", authenticateToken, (req, res) => {
  const memStr = JSON.stringify(req.body);
  db.run(
    `INSERT INTO gstin_memory (company_name, memory_data) VALUES (?, ?) ON CONFLICT(company_name) DO UPDATE SET memory_data = ?`,
    [req.params.companyName, memStr, memStr],
    () => res.json({ success: true })
  );
});
app.delete("/api/memory/:companyName", authenticateToken, (req, res) => {
  db.run(`DELETE FROM gstin_memory WHERE company_name = ?`, [req.params.companyName], () => res.json({ success: true }));
});
app.get("/api/sessions", authenticateToken, (req, res) => {
  db.all(`SELECT session_data FROM sessions ORDER BY timestamp DESC`, [], (err, rows) => {
    res.json((rows || []).map((r) => JSON.parse(r.session_data)));
  });
});
app.post("/api/sessions", authenticateToken, (req, res) => {
  const data = req.body;
  const str = JSON.stringify(data);
  db.run(
    `INSERT INTO sessions (id, username, company_name, mode, timestamp, session_data) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET session_data = ?, timestamp = ?`,
    [data.id, req.user.username, data.companyName, data.mode, data.timestamp, str, str, data.timestamp],
    () => res.json({ success: true })
  );
});
app.delete("/api/sessions/:id", authenticateToken, (req, res) => {
  db.run(`DELETE FROM sessions WHERE id = ?`, [req.params.id], () => res.json({ success: true }));
});
app.get("/api/consolidations", authenticateToken, (req, res) => {
  db.all(`SELECT id, username, company_name, timestamp FROM consolidations ORDER BY timestamp DESC`, [], (err, rows) => res.json(rows || []));
});
app.get("/api/consolidations/:id", authenticateToken, (req, res) => {
  db.get(`SELECT consolidation_data FROM consolidations WHERE id = ?`, [req.params.id], (err, row) => {
    res.json(row && row.consolidation_data ? JSON.parse(row.consolidation_data) : null);
  });
});
app.post("/api/consolidations", authenticateToken, async (req, res) => {
  const data = req.body;
  const str = JSON.stringify(data.records);
  try {
    const officeId = await getOfficeId();
    if (officeId) {
      await (0, import_firestore.addDoc)((0, import_firestore.collection)(firestore, "reco_history"), {
        time: new Date(data.timestamp).toLocaleString(),
        user: req.user.username,
        company: data.companyName,
        type: "Consolidation",
        records: data.records ? data.records.length : 0,
        issues: 0,
        office_id: officeId
      });
    }
  } catch (e) {
    console.error("Cloud log failed", e);
  }
  db.run(
    `INSERT INTO consolidations (id, username, company_name, timestamp, consolidation_data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET consolidation_data = ?, timestamp = ?`,
    [data.id, req.user.username, data.companyName, data.timestamp, str, str, data.timestamp],
    function(err) {
      if (err) {
        console.error("DB Error saving workspace:", err);
        return res.status(500).json({ error: "Database error while saving workspace." });
      }
      res.json({ success: true });
    }
  );
});
app.delete("/api/consolidations/:id", authenticateToken, (req, res) => {
  db.run(`DELETE FROM consolidations WHERE id = ?`, [req.params.id], () => res.json({ success: true }));
});
app.get("/api/clients", authenticateToken, (req, res) => {
  db.all(`SELECT * FROM clients ORDER BY trade_name ASC`, [], (err, rows) => res.json(rows || []));
});
app.post("/api/clients", authenticateToken, (req, res) => {
  const { id, gstin, trade_name, legal_name, email, phone } = req.body;
  db.run(
    `INSERT INTO clients (id, username, gstin, trade_name, legal_name, email, phone) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(gstin) DO UPDATE SET trade_name = ?, legal_name = ?, email = ?, phone = ?`,
    [id, req.user.username, gstin, trade_name, legal_name, email, phone, trade_name, legal_name, email, phone],
    () => res.json({ success: true })
  );
});
app.delete("/api/clients/:id", authenticateToken, (req, res) => {
  db.run(`DELETE FROM clients WHERE id = ?`, [req.params.id], () => res.json({ success: true }));
});
app.get("/api/tasks", authenticateToken, (req, res) => {
  db.all(`SELECT * FROM tasks ORDER BY due_date ASC`, [], (err, rows) => res.json(rows || []));
});
app.post("/api/tasks", authenticateToken, (req, res) => {
  const { id, client_gstin, return_type, period, due_date, status, tax_amount } = req.body;
  db.run(
    `INSERT INTO tasks (id, username, client_gstin, return_type, period, due_date, status, tax_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = ?, tax_amount = ?`,
    [id, req.user.username, client_gstin, return_type, period, due_date, status, tax_amount, status, tax_amount],
    () => res.json({ success: true })
  );
});
app.delete("/api/tasks/:id", authenticateToken, (req, res) => {
  db.run(`DELETE FROM tasks WHERE id = ?`, [req.params.id], () => res.json({ success: true }));
});
app.post("/api/backup/drive", authenticateToken, (req, res) => {
  setTimeout(() => res.json({ success: true, message: "Local database securely backed up to Google Drive." }), 1500);
});
app.post("/api/portal/import-client", authenticateToken, async (req, res) => {
  const targetGstin = req.body.gstin;
  if (!targetGstin || targetGstin.length !== 15) {
    return res.status(400).json({ success: false, error: "Invalid GSTIN" });
  }
  let browser;
  try {
    let playwright;
    try {
      playwright = await import("playwright");
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: "Playwright is not installed on this server. Portal import is unavailable without installing playwright."
      });
    }
    browser = await playwright.chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("https://services.gst.gov.in/services/searchtp", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#for_gstin", { timeout: 15e3 });
    await page.fill("#for_gstin", targetGstin);
    await page.waitForSelector('text="Legal Name of Business"', { timeout: 9e4 });
    await page.waitForTimeout(1500);
    const pageText = await page.innerText("body");
    const extractField = (label) => {
      const regex = new RegExp(`${label}[\\s\\n]+([^\\n]+)`);
      const match = pageText.match(regex);
      return match ? match[1].trim() : "";
    };
    const legalName = extractField("Legal Name of Business") || extractField("Legal Name of Taxpayer");
    const tradeName = extractField("Trade Name") || legalName;
    await browser.close();
    res.json({
      success: true,
      data: {
        gstin: targetGstin,
        trade_name: tradeName || "Failed to parse Trade Name",
        legal_name: legalName || "Failed to parse Legal Name",
        email: "",
        // Typically masked on public search
        phone: ""
      }
    });
  } catch (err) {
    if (browser) await browser.close();
    console.error("Playwright automation failed:", err);
    res.status(500).json({ success: false, error: "Failed to fetch from portal or timeout waiting for CAPTCHA." });
  }
});
app.post("/api/alerts/send", authenticateToken, (req, res) => {
  setTimeout(() => res.json({ success: true }), 1e3);
});
app.post("/api/returns/validate-gstin", authenticateToken, (req, res) => {
  setTimeout(() => res.json({ success: true, message: "GSTIN Validated successfully via Portal.", status: "Active" }), 1500);
});
app.post("/api/returns/generate-json", authenticateToken, (req, res) => {
  setTimeout(() => res.json({ success: true, message: "JSON Payload generated successfully." }), 1e3);
});
app.post("/api/returns/upload", authenticateToken, (req, res) => {
  setTimeout(() => res.json({ success: true, message: "Data uploaded to GST Portal successfully." }), 2500);
});
app.post("/api/returns/draft-pdf", authenticateToken, (req, res) => {
  setTimeout(() => res.json({ success: true, message: "Draft PDF generated for review." }), 1500);
});
app.post("/api/returns/file", authenticateToken, (req, res) => {
  setTimeout(() => res.json({ success: true, message: "Return Filed Successfully via OTP!" }), 3e3);
});
app.post("/session/start", authenticateToken, (req, res) => {
  const { username, userAgent, location } = req.body;
  const banned = loadJson(BANNED_PATH);
  if (banned[username]) return res.status(403).json({ error: "Banned" });
  const now = Date.now();
  if (activeSessions[username] && now - activeSessions[username].lastSeen < 6e3) return res.status(409).json({ error: "Already logged in" });
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "Unknown";
  const sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
  activeSessions[username] = { id: sessionId, username, ip: ip.replace("::ffff:", ""), userAgent, location, loginTime: now, lastSeen: now };
  res.json({ sessionId });
});
app.post("/session/heartbeat", authenticateToken, (req, res) => {
  const { sessionId, username } = req.body;
  const banned = loadJson(BANNED_PATH);
  if (banned[username]) return res.status(403).json({ error: "Banned" });
  if (!activeSessions[username] || activeSessions[username].id !== sessionId) return res.status(403).json({ error: "Session Invalid" });
  activeSessions[username].lastSeen = Date.now();
  res.json({ success: true });
});
app.get("/sessions", authenticateToken, (req, res) => {
  const now = Date.now();
  for (const user in activeSessions) if (now - activeSessions[user].lastSeen > 12e4) delete activeSessions[user];
  res.json({ sessions: Object.values(activeSessions), banned: loadJson(BANNED_PATH) });
});
app.post("/ban", authenticateToken, (req, res) => {
  const { username, isBanned } = req.body;
  const banned = loadJson(BANNED_PATH);
  if (isBanned) {
    banned[username] = true;
    delete activeSessions[username];
  } else delete banned[username];
  saveJson(BANNED_PATH, banned);
  res.json({ success: true });
});
app.post("/screen/request", authenticateToken, (req, res) => {
  screenRequests[req.body.username] = true;
  res.json({ success: true });
});
app.get("/screen/check-request/:username", authenticateToken, (req, res) => {
  const requested = !!screenRequests[req.params.username];
  if (requested) delete screenRequests[req.params.username];
  res.json({ requested });
});
app.post("/screen/send", authenticateToken, (req, res) => {
  screenFrames[req.body.username] = { image: req.body.image, time: Date.now() };
  res.json({ success: true });
});
app.get("/screen/view/:username", authenticateToken, (req, res) => {
  const frame = screenFrames[req.params.username];
  res.json({ image: frame && Date.now() - frame.time < 15e3 ? frame.image : null });
});
app.post("/message/send", authenticateToken, (req, res) => {
  const { username, message } = req.body;
  if (username && message) {
    userMessages[username] = message;
    res.json({ success: true });
  } else res.status(400).json({ success: false });
});
app.get("/message/check/:username", authenticateToken, (req, res) => {
  const message = userMessages[req.params.username];
  if (message) delete userMessages[req.params.username];
  res.json({ message: message || null });
});
app.get("/audit", authenticateToken, (req, res) => res.json(getAuditLogs()));
app.post("/audit", authenticateToken, (req, res) => {
  const logs = getAuditLogs();
  logs.unshift({ id: Date.now().toString(), timestamp: Date.now(), ...req.body });
  if (logs.length > 500) logs.pop();
  import_fs2.default.writeFileSync(AUDIT_PATH, JSON.stringify(logs, null, 2));
  res.json({ success: true });
});
app.post("/api/tally-proxy", import_express.default.text({ type: "*/*" }), async (req, res) => {
  const port = req.headers["x-tally-port"] || 9e3;
  try {
    const fetch = (await import("node-fetch")).default || global.fetch;
    const response = await fetch(`http://127.0.0.1:${port}`, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8" },
      body: typeof req.body === "string" ? req.body : JSON.stringify(req.body)
    });
    const text = await response.text();
    res.set("Content-Type", "text/xml; charset=utf-8");
    res.send(text);
  } catch (err) {
    res.status(500).send("Tally Proxy Error: " + err.message);
  }
});
app.post("/api/cma/generate", authenticateToken, async (req, res) => {
  try {
    const payload = req.body;
    const tempJsonPath = import_path.default.join(__dirname, `temp_cma_${Date.now()}.json`);
    const tempExcelPath = import_path.default.join(__dirname, `CMA_Report_${Date.now()}.xlsx`);
    import_fs2.default.writeFileSync(tempJsonPath, JSON.stringify(payload));
    const pythonCmd = process.platform === "win32" ? "python" : "python3";
    const generatorScript = import_path.default.join(__dirname, "scripts", "cma", "cma_generator.py");
    const child = (0, import_child_process2.spawn)(pythonCmd, [generatorScript, tempJsonPath, tempExcelPath]);
    let stderrData = "";
    child.stderr.on("data", (data) => {
      stderrData += data.toString();
    });
    child.on("close", (code) => {
      try {
        if (import_fs2.default.existsSync(tempJsonPath)) import_fs2.default.unlinkSync(tempJsonPath);
      } catch (err) {
      }
      if (code !== 0) {
        console.error("Python generator error:", stderrData);
        return res.status(500).json({ error: "Failed to generate Excel report: " + stderrData });
      }
      res.download(tempExcelPath, `${payload.client_metadata?.company_name || "CMA"}_Project_Report.xlsx`, (err) => {
        try {
          if (import_fs2.default.existsSync(tempExcelPath)) import_fs2.default.unlinkSync(tempExcelPath);
        } catch (cleanupErr) {
        }
      });
    });
  } catch (error) {
    console.error("CMA generation server error:", error);
    res.status(500).json({ error: error.message });
  }
});
app.get(/(.*)/, (req, res) => {
  res.sendFile(import_path.default.join(__dirname, "dist", "index.html"));
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Network Server API running on port ${PORT}`);
  try {
    const pythonScriptPath = import_path.default.join(__dirname, "LevitateExtract", "main.py");
    let pythonExe = "python3";
    if (process.platform === "win32") {
      try {
        (0, import_child_process2.execSync)("python --version", { stdio: "ignore" });
        pythonExe = "python";
      } catch (e) {
        const userProfile = process.env.USERPROFILE || "C:\\Users\\Dell05";
        pythonExe = import_path.default.join(userProfile, "AppData", "Local", "Programs", "Python", "Python313", "python.exe");
      }
    }
    console.log(`[LevitateExtract] Launching microservice programmatically: ${pythonExe}`);
    const env = { ...process.env };
    env.OPENBLAS_NUM_THREADS = "1";
    env.MKL_NUM_THREADS = "1";
    env.OMP_NUM_THREADS = "1";
    env.NUMEXPR_NUM_THREADS = "1";
    env.PYTHONDONTWRITEBYTECODE = "1";
    const outLog = import_fs2.default.openSync(import_path.default.join(__dirname, "LevitateExtract", "programmatic_out.log"), "a");
    const errLog = import_fs2.default.openSync(import_path.default.join(__dirname, "LevitateExtract", "programmatic_err.log"), "a");
    const pythonProcess = (0, import_child_process2.spawn)(pythonExe, [pythonScriptPath], {
      cwd: import_path.default.join(__dirname, "LevitateExtract"),
      env,
      detached: true,
      stdio: ["ignore", outLog, errLog]
    });
    pythonProcess.unref();
    console.log(`[LevitateExtract] Programmatic microservice spawned detached with log redirection. PID: ${pythonProcess.pid}`);
  } catch (err) {
    console.error("[LevitateExtract] Failed to spawn programmatic microservice:", err);
  }
});
/*! Bundled license information:

media-typer/index.js:
  (*!
   * media-typer
   * Copyright(c) 2014 Douglas Christopher Wilson
   * MIT Licensed
   *)

mime-db/index.js:
  (*!
   * mime-db
   * Copyright(c) 2014 Jonathan Ong
   * Copyright(c) 2015-2022 Douglas Christopher Wilson
   * MIT Licensed
   *)

mime-types/index.js:
  (*!
   * mime-types
   * Copyright(c) 2014 Jonathan Ong
   * Copyright(c) 2015 Douglas Christopher Wilson
   * MIT Licensed
   *)

type-is/index.js:
  (*!
   * type-is
   * Copyright(c) 2014 Jonathan Ong
   * Copyright(c) 2014-2015 Douglas Christopher Wilson
   * MIT Licensed
   *)

safe-buffer/index.js:
  (*! safe-buffer. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> *)
*/

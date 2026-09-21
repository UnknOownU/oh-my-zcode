"use strict";
/**
 * Per-language extraction configurations.
 *
 * Each file exports a LanguageExtractor config object.
 * This barrel builds the EXTRACTORS map consumed by TreeSitterExtractor.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXTRACTORS = void 0;
const typescript_1 = require("./typescript");
const javascript_1 = require("./javascript");
const python_1 = require("./python");
const go_1 = require("./go");
const rust_1 = require("./rust");
const java_1 = require("./java");
const c_cpp_1 = require("./c-cpp");
const csharp_1 = require("./csharp");
const php_1 = require("./php");
const ruby_1 = require("./ruby");
const swift_1 = require("./swift");
const kotlin_1 = require("./kotlin");
const dart_1 = require("./dart");
const pascal_1 = require("./pascal");
const scala_1 = require("./scala");
const lua_1 = require("./lua");
const r_1 = require("./r");
const luau_1 = require("./luau");
const objc_1 = require("./objc");
const cfscript_1 = require("./cfscript");
const cfquery_1 = require("./cfquery");
const cobol_1 = require("./cobol");
const vbnet_1 = require("./vbnet");
const erlang_1 = require("./erlang");
const solidity_1 = require("./solidity");
const terraform_1 = require("./terraform");
const arkts_1 = require("./arkts");
const nix_1 = require("./nix");
exports.EXTRACTORS = {
    typescript: typescript_1.typescriptExtractor,
    tsx: typescript_1.typescriptExtractor,
    javascript: javascript_1.javascriptExtractor,
    jsx: javascript_1.javascriptExtractor,
    python: python_1.pythonExtractor,
    go: go_1.goExtractor,
    rust: rust_1.rustExtractor,
    java: java_1.javaExtractor,
    c: c_cpp_1.cExtractor,
    cpp: c_cpp_1.cppExtractor,
    csharp: csharp_1.csharpExtractor,
    php: php_1.phpExtractor,
    ruby: ruby_1.rubyExtractor,
    swift: swift_1.swiftExtractor,
    kotlin: kotlin_1.kotlinExtractor,
    dart: dart_1.dartExtractor,
    pascal: pascal_1.pascalExtractor,
    scala: scala_1.scalaExtractor,
    lua: lua_1.luaExtractor,
    r: r_1.rExtractor,
    luau: luau_1.luauExtractor,
    objc: objc_1.objcExtractor,
    cfscript: cfscript_1.cfscriptExtractor,
    cfquery: cfquery_1.cfqueryExtractor,
    cobol: cobol_1.cobolExtractor,
    vbnet: vbnet_1.vbnetExtractor,
    erlang: erlang_1.erlangExtractor,
    solidity: solidity_1.solidityExtractor,
    terraform: terraform_1.terraformExtractor,
    arkts: arkts_1.arktsExtractor,
    nix: nix_1.nixExtractor,
};
//# sourceMappingURL=index.js.map
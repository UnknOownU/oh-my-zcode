"use strict";
/**
 * Framework Resolver Registry
 *
 * Manages framework-specific resolvers.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.fabricViewResolver = exports.expoModulesResolver = exports.reactNativeBridgeResolver = exports.swiftObjcBridgeResolver = exports.vaporResolver = exports.uikitResolver = exports.swiftUIResolver = exports.aspnetResolver = exports.rustResolver = exports.goframeResolver = exports.goResolver = exports.playResolver = exports.springResolver = exports.railsResolver = exports.fastapiResolver = exports.flaskResolver = exports.djangoResolver = exports.astroResolver = exports.vueResolver = exports.svelteResolver = exports.reactResolver = exports.nestjsResolver = exports.expressResolver = exports.FACADE_MAPPINGS = exports.laravelResolver = exports.drupalResolver = void 0;
exports.getAllFrameworkResolvers = getAllFrameworkResolvers;
exports.getFrameworkResolver = getFrameworkResolver;
exports.detectFrameworks = detectFrameworks;
exports.getApplicableFrameworks = getApplicableFrameworks;
exports.registerFrameworkResolver = registerFrameworkResolver;
const drupal_1 = require("./drupal");
const laravel_1 = require("./laravel");
const express_1 = require("./express");
const nestjs_1 = require("./nestjs");
const react_1 = require("./react");
const svelte_1 = require("./svelte");
const vue_1 = require("./vue");
const astro_1 = require("./astro");
const python_1 = require("./python");
const ruby_1 = require("./ruby");
const java_1 = require("./java");
const play_1 = require("./play");
const go_1 = require("./go");
const goframe_1 = require("./goframe");
const rust_1 = require("./rust");
const csharp_1 = require("./csharp");
const swift_1 = require("./swift");
const swift_objc_1 = require("./swift-objc");
const react_native_1 = require("./react-native");
const expo_modules_1 = require("./expo-modules");
const fabric_1 = require("./fabric");
const cics_1 = require("./cics");
const terraform_1 = require("./terraform");
/**
 * All registered framework resolvers
 */
const FRAMEWORK_RESOLVERS = [
    // PHP
    laravel_1.laravelResolver,
    drupal_1.drupalResolver,
    // JavaScript/TypeScript
    express_1.expressResolver,
    nestjs_1.nestjsResolver,
    react_1.reactResolver,
    svelte_1.svelteResolver,
    vue_1.vueResolver,
    astro_1.astroResolver,
    // Python
    python_1.djangoResolver,
    python_1.flaskResolver,
    python_1.fastapiResolver,
    // Ruby
    ruby_1.railsResolver,
    // Java
    java_1.springResolver,
    play_1.playResolver,
    // Go
    go_1.goResolver,
    goframe_1.goframeResolver,
    // Rust
    rust_1.rustResolver,
    // C#
    csharp_1.aspnetResolver,
    // Swift
    swift_1.swiftUIResolver,
    swift_1.uikitResolver,
    swift_1.vaporResolver,
    // Swift ↔ Objective-C cross-language bridging (mixed iOS apps)
    swift_objc_1.swiftObjcBridgeResolver,
    // React Native JS ↔ native bridge (legacy + TurboModules)
    react_native_1.reactNativeBridgeResolver,
    // Expo Modules — Function/AsyncFunction/Property DSL on Swift/Kotlin
    expo_modules_1.expoModulesResolver,
    // React Native Fabric / Codegen view components — TS spec → component nodes
    fabric_1.fabricViewResolver,
    // CICS pseudo-conversational TRANSID hops (COBOL)
    cics_1.cicsResolver,
    // Terraform / OpenTofu — disambiguate var/local/module/resource refs to same-dir module
    terraform_1.terraformResolver,
];
/**
 * Get all framework resolvers
 */
function getAllFrameworkResolvers() {
    return FRAMEWORK_RESOLVERS;
}
/**
 * Get a resolver by name
 */
function getFrameworkResolver(name) {
    return FRAMEWORK_RESOLVERS.find((r) => r.name === name);
}
/**
 * Detect which frameworks are used in a project
 */
function detectFrameworks(context) {
    return FRAMEWORK_RESOLVERS.filter((resolver) => {
        try {
            return resolver.detect(context);
        }
        catch {
            return false;
        }
    });
}
/**
 * Filter a list of detected frameworks down to ones that apply to a given language.
 * Frameworks without an explicit `languages` list are treated as universal.
 */
function getApplicableFrameworks(detected, language) {
    return detected.filter((fw) => !fw.languages || fw.languages.includes(language));
}
/**
 * Register a custom framework resolver
 */
function registerFrameworkResolver(resolver) {
    // Remove existing resolver with same name
    const index = FRAMEWORK_RESOLVERS.findIndex((r) => r.name === resolver.name);
    if (index !== -1) {
        FRAMEWORK_RESOLVERS.splice(index, 1);
    }
    FRAMEWORK_RESOLVERS.push(resolver);
}
// Re-export framework resolvers
var drupal_2 = require("./drupal");
Object.defineProperty(exports, "drupalResolver", { enumerable: true, get: function () { return drupal_2.drupalResolver; } });
var laravel_2 = require("./laravel");
Object.defineProperty(exports, "laravelResolver", { enumerable: true, get: function () { return laravel_2.laravelResolver; } });
Object.defineProperty(exports, "FACADE_MAPPINGS", { enumerable: true, get: function () { return laravel_2.FACADE_MAPPINGS; } });
var express_2 = require("./express");
Object.defineProperty(exports, "expressResolver", { enumerable: true, get: function () { return express_2.expressResolver; } });
var nestjs_2 = require("./nestjs");
Object.defineProperty(exports, "nestjsResolver", { enumerable: true, get: function () { return nestjs_2.nestjsResolver; } });
var react_2 = require("./react");
Object.defineProperty(exports, "reactResolver", { enumerable: true, get: function () { return react_2.reactResolver; } });
var svelte_2 = require("./svelte");
Object.defineProperty(exports, "svelteResolver", { enumerable: true, get: function () { return svelte_2.svelteResolver; } });
var vue_2 = require("./vue");
Object.defineProperty(exports, "vueResolver", { enumerable: true, get: function () { return vue_2.vueResolver; } });
var astro_2 = require("./astro");
Object.defineProperty(exports, "astroResolver", { enumerable: true, get: function () { return astro_2.astroResolver; } });
var python_2 = require("./python");
Object.defineProperty(exports, "djangoResolver", { enumerable: true, get: function () { return python_2.djangoResolver; } });
Object.defineProperty(exports, "flaskResolver", { enumerable: true, get: function () { return python_2.flaskResolver; } });
Object.defineProperty(exports, "fastapiResolver", { enumerable: true, get: function () { return python_2.fastapiResolver; } });
var ruby_2 = require("./ruby");
Object.defineProperty(exports, "railsResolver", { enumerable: true, get: function () { return ruby_2.railsResolver; } });
var java_2 = require("./java");
Object.defineProperty(exports, "springResolver", { enumerable: true, get: function () { return java_2.springResolver; } });
var play_2 = require("./play");
Object.defineProperty(exports, "playResolver", { enumerable: true, get: function () { return play_2.playResolver; } });
var go_2 = require("./go");
Object.defineProperty(exports, "goResolver", { enumerable: true, get: function () { return go_2.goResolver; } });
var goframe_2 = require("./goframe");
Object.defineProperty(exports, "goframeResolver", { enumerable: true, get: function () { return goframe_2.goframeResolver; } });
var rust_2 = require("./rust");
Object.defineProperty(exports, "rustResolver", { enumerable: true, get: function () { return rust_2.rustResolver; } });
var csharp_2 = require("./csharp");
Object.defineProperty(exports, "aspnetResolver", { enumerable: true, get: function () { return csharp_2.aspnetResolver; } });
var swift_2 = require("./swift");
Object.defineProperty(exports, "swiftUIResolver", { enumerable: true, get: function () { return swift_2.swiftUIResolver; } });
Object.defineProperty(exports, "uikitResolver", { enumerable: true, get: function () { return swift_2.uikitResolver; } });
Object.defineProperty(exports, "vaporResolver", { enumerable: true, get: function () { return swift_2.vaporResolver; } });
var swift_objc_2 = require("./swift-objc");
Object.defineProperty(exports, "swiftObjcBridgeResolver", { enumerable: true, get: function () { return swift_objc_2.swiftObjcBridgeResolver; } });
var react_native_2 = require("./react-native");
Object.defineProperty(exports, "reactNativeBridgeResolver", { enumerable: true, get: function () { return react_native_2.reactNativeBridgeResolver; } });
var expo_modules_2 = require("./expo-modules");
Object.defineProperty(exports, "expoModulesResolver", { enumerable: true, get: function () { return expo_modules_2.expoModulesResolver; } });
var fabric_2 = require("./fabric");
Object.defineProperty(exports, "fabricViewResolver", { enumerable: true, get: function () { return fabric_2.fabricViewResolver; } });
//# sourceMappingURL=index.js.map
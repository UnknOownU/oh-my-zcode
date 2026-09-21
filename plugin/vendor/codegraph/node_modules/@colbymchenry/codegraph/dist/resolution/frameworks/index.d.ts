/**
 * Framework Resolver Registry
 *
 * Manages framework-specific resolvers.
 */
import { FrameworkResolver, ResolutionContext } from '../types';
import type { Language } from '../../types';
/**
 * Get all framework resolvers
 */
export declare function getAllFrameworkResolvers(): FrameworkResolver[];
/**
 * Get a resolver by name
 */
export declare function getFrameworkResolver(name: string): FrameworkResolver | undefined;
/**
 * Detect which frameworks are used in a project
 */
export declare function detectFrameworks(context: ResolutionContext): FrameworkResolver[];
/**
 * Filter a list of detected frameworks down to ones that apply to a given language.
 * Frameworks without an explicit `languages` list are treated as universal.
 */
export declare function getApplicableFrameworks(detected: FrameworkResolver[], language: Language): FrameworkResolver[];
/**
 * Register a custom framework resolver
 */
export declare function registerFrameworkResolver(resolver: FrameworkResolver): void;
export { drupalResolver } from './drupal';
export { laravelResolver, FACADE_MAPPINGS } from './laravel';
export { expressResolver } from './express';
export { nestjsResolver } from './nestjs';
export { reactResolver } from './react';
export { svelteResolver } from './svelte';
export { vueResolver } from './vue';
export { astroResolver } from './astro';
export { djangoResolver, flaskResolver, fastapiResolver } from './python';
export { railsResolver } from './ruby';
export { springResolver } from './java';
export { playResolver } from './play';
export { goResolver } from './go';
export { goframeResolver } from './goframe';
export { rustResolver } from './rust';
export { aspnetResolver } from './csharp';
export { swiftUIResolver, uikitResolver, vaporResolver } from './swift';
export { swiftObjcBridgeResolver } from './swift-objc';
export { reactNativeBridgeResolver } from './react-native';
export { expoModulesResolver } from './expo-modules';
export { fabricViewResolver } from './fabric';
//# sourceMappingURL=index.d.ts.map
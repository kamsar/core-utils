import type { TransformOptions, TransformResult } from 'esbuild';
import { sha1 } from '../utils/sha1';
import { hasNativeSourceMapSupport } from '../utils/has-native-source-map-support';
import cache from './cache';

let esbuild: typeof import('esbuild');
try {
	const localEsbuildPath = require.resolve('esbuild', {
		paths: [
			process.cwd(),
		],
	});
	esbuild = require(localEsbuildPath); // eslint-disable-line node/global-require
} catch {
	esbuild = require('esbuild'); // eslint-disable-line node/global-require
}

const {
	transform: esbuildTransform,
	transformSync: esbuildTransformSync,
	version: esbuildVersion,
} = esbuild;

// Check if file is explicitly a CJS file
const isCJS = (sourcePath: string) => (
	sourcePath.endsWith('.cjs')
	|| sourcePath.endsWith('.cjs.js')
);

const nodeVersion = process.versions.node;

const getTransformOptions = (
	extendOptions: TransformOptions,
) => {
	const options: TransformOptions = {
		target: `node${nodeVersion}`,

		// "default" tells esbuild to infer loader from file name
		// https://github.com/evanw/esbuild/blob/4a07b17adad23e40cbca7d2f8931e8fb81b47c33/internal/bundler/bundler.go#L158
		loader: 'default',

		sourcemap: hasNativeSourceMapSupport ? 'inline' : true,

		// Marginal performance improvement:
		// https://twitter.com/evanwallace/status/1396336348366180359?s=20
		// Smaller output for cache
		minify: true,
		keepNames: true,

		...extendOptions,
	};

	if (options.sourcefile) {
		// https://github.com/evanw/esbuild/issues/1932
		options.sourcefile = options.sourcefile.replace(/\.[cm]ts/, '.ts');
	}

	return options;
};

// Used by cjs-loader
export function transformSync(
	code: string,
	filePath: string,
	extendOptions?: TransformOptions,
): TransformResult {
	if (isCJS(filePath)) {
		return {
			code,
			map: '',
			warnings: [],
		};
	}

	const options = getTransformOptions({
		sourcefile: filePath,
		...extendOptions,
	});

	const hash = sha1(code + JSON.stringify(options) + esbuildVersion);
	const cacheHit = cache.get(hash);
	if (cacheHit) {
		return cacheHit;
	}

	const transformed = esbuildTransformSync(code, options);
	if (transformed.warnings.length > 0) {
		const { warnings } = transformed;
		for (const warning of warnings) {
			console.log(warning);
		}
	}

	cache.set(hash, transformed);

	return transformed;
}

// Used by esm-loader
export async function transform(
	code: string,
	filePath: string,
	extendOptions?: TransformOptions,
): Promise<TransformResult> {
	if (isCJS(filePath)) {
		return {
			code,
			map: '',
			warnings: [],
		};
	}

	const options = getTransformOptions({
		sourcefile: filePath,
		...extendOptions,
	});

	const hash = sha1(code + JSON.stringify(options) + esbuildVersion);
	const cacheHit = cache.get(hash);
	if (cacheHit) {
		return cacheHit;
	}

	const transformed = await esbuildTransform(code, options);

	if (transformed.warnings.length > 0) {
		const { warnings } = transformed;
		for (const warning of warnings) {
			console.log(warning);
		}
	}

	cache.set(hash, transformed);

	return transformed;
}
"use strict";

const fs = require("fs-extra");
const path = require("path");
const { FontIo } = require("ot-builder");

const Toml = require("@iarna/toml");

const BuildFont = require("./gen/build-font.js");
const Parameters = require("./support/parameters");
const VariantData = require("./support/variant-data");
const ApplyLigationData = require("./support/ligation-data");
const { createGrDisplaySheet } = require("./support/gr");

module.exports = async function main(argv) {
	const para = await getParameters(argv);
	const { font, glyphStore } = BuildFont(para);
	if (argv.oCharMap) await saveCharMap(argv, glyphStore);
	if (argv.o) await saveTTF(argv, font);
};

// Parameter preparation
async function getParameters(argv) {
	const PARAMETERS_TOML = path.resolve(__dirname, "../params/parameters.toml");
	const WEIGHTS_TOML = path.resolve(__dirname, "../params/shape-weight.toml");
	const WIDTHS_TOML = path.resolve(__dirname, "../params/shape-width.toml");
	const PRIVATE_TOML = path.resolve(__dirname, "../params/private-parameters.toml");
	const VARIANTS_TOML = path.resolve(__dirname, "../params/variants.toml");
	const LIGATIONS_TOML = path.resolve(__dirname, "../params/ligation-set.toml");

	const parametersData = Object.assign(
		{},
		await tryParseToml(PARAMETERS_TOML),
		await tryParseToml(WEIGHTS_TOML),
		await tryParseToml(WIDTHS_TOML),
		fs.existsSync(PRIVATE_TOML) ? await tryParseToml(PRIVATE_TOML) : {}
	);
	const rawVariantsData = await tryParseToml(VARIANTS_TOML);
	const rawLigationData = await tryParseToml(LIGATIONS_TOML);

	let para = Parameters.init(parametersData, argv);
	VariantData.apply(rawVariantsData, para, argv);
	ApplyLigationData(rawLigationData, para, argv);

	if (argv.excludedCharRanges) para.excludedCharRanges = argv.excludedCharRanges;
	if (argv.compatibilityLigatures) para.compLig = argv.compatibilityLigatures;
	if (argv.metricOverride) Parameters.applyMetricOverride(para, argv.metricOverride);

	para.naming = {
		...para.naming,
		family: argv.menu.family,
		version: argv.menu.version,
		weight: argv.menu.weight - 0,
		width: argv.menu.width - 0,
		slope: argv.menu.slope
	};
	return para;
}

async function tryParseToml(str) {
	try {
		return Toml.parse(await fs.readFile(str, "utf-8"));
	} catch (e) {
		throw new Error(
			`Failed to parse configuration file ${str}.\nPlease validate whether there's syntax error.\n${e}`
		);
	}
}

// Save TTF
async function saveTTF(argv, font) {
	const sfnt = FontIo.writeFont(font, {
		glyphStore: { statOs2XAvgCharWidth: false },
		generateDummyDigitalSignature: true
	});
	const buf = FontIo.writeSfntOtf(sfnt);
	await fs.writeFile(argv.o, buf);
}

// Save character map file
async function saveCharMap(argv, glyphStore) {
	let charMap = [];
	for (const [gn] of glyphStore.namedEntries()) {
		charMap.push([
			gn,
			Array.from(glyphStore.queryUnicodeOfName(gn) || []),
			...createGrDisplaySheet(glyphStore, gn)
		]);
	}
	await fs.writeFile(argv.oCharMap, JSON.stringify(charMap), "utf8");
}

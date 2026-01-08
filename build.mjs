import fs from "node:fs";
import { exec } from "child_process";
const conf = "build-conf.mjs";
const info = fs.existsSync( conf )
	? fs.readFileSync( conf, "utf-8" )
	: {};

const headerLines = [
	`<!DOCTYPE html>`,
	`<html lang="en">`,
	`<head>`,
	`<title>${ info.title }</title>`,
	`<meta charset="utf-8"/>`,
	`<meta name="viewport" content="width=device-width, user-scalable=no"/>`,
	`<meta name="description" content="${ info.desc }"/>`,
	`<meta name="google" content="notranslate"/>`,
	`<meta name="theme-color" content="#3a5158"/>`,
	`<meta property="og:type" content="website"/>`,
	info.title    && `<meta property="og:title" content="${ info.title }"/>`,
	info.url      && `<meta property="og:url" content="${ info.url }"/>`,
	info.ogImage  && `<meta property="og:image" content="${ info.ogImage }"/>`,
	info.ogImageW && `<meta property="og:image:width" content="${ info.ogImageW }"/>`,
	info.ogImageH && `<meta property="og:image:height" content="${ info.ogImageH }"/>`,
	info.desc     && `<meta property="og:description" content="${ info.desc }"/>`,
	info.manifest && `<link rel="manifest" href="${ info.manifest }"/>`,
	info.favicon  && `<link rel="shortcut icon" href="${ info.favicon }"/>`,
];

const bodyLines = [
	`</head>`,
	`<body>`,
	`<noscript>It needs JavaScript to run</noscript>`,
];

const endLines = [
	`</body>`,
	`</html>`,
];

async function writeDevFile( prefix = "" ) {
	return [
		formatLines( headerLines ) + "\n",
		info.cssSrcA      && formatSep, ...( info.cssSrcA || [] ).map( s => formatStyle( s ) ),
		info.cssDep       && formatSep, ...( info.cssDep  || [] ).map( s => formatStyle( `${ prefix }${ s }` ) ),
		info.cssSrcB      && formatSep, ...( info.cssSrcB || [] ).map( s => formatStyle( s ) ),
		                     formatSep, formatLines( bodyLines ) + "\n",
		info.splashScreen && formatSep, info.splashScreen && await readFile( info.splashScreen ),
		                     formatSep, `<script>function lg(a){return console.log.apply(console,arguments),a}</script>\n`,
		info.jsSrcA       && formatSep, ...( info.jsSrcA || [] ).map( s => formatScript( s ) ),
		info.jsDep        && formatSep, ...( info.jsDep  || [] ).map( s => formatScript( `${ prefix }${ s }` ) ),
		info.jsSrcB       && formatSep, ...( info.jsSrcB || [] ).map( s => formatScript( s ) ),
		formatLines( endLines ),
	].filter( Boolean ).join( "" );
}

async function writeProFile() {
	const cssSrcA = await readFiles( info.cssSrcA );
	const cssSrcB = await readFiles( info.cssSrcB );
	const cssDep = await readFiles( info.cssDep );
	const jsSrcA = await readFiles( info.jsSrcA );
	const jsSrcB = await readFiles( info.jsSrcB );
	const jsDep = await readFiles( info.jsDep );
	let jsPre = `"use strict"; function lg( a ){ return a; }`;

	if ( info.serviceWorker ) {
		jsPre += `navigator.serviceWorker?.register( "${ info.serviceWorker }" ).then(
			reg => console.log( "Service worker:", reg ),
			err => console.warn( "Service worker registration failed:", err )
		);\n`;
	}

	fs.writeFileSync( "allCSS.css", cssSrcA + cssDep + cssSrcB );
	fs.writeFileSync( "allJS.js", jsPre + jsSrcA + jsDep + jsSrcB );

	const cssMin = await execLightningCSS( "allCSS.css" );
	const jsMin = await execTerser( "allJS.js" );

	fs.unlinkSync( "allCSS.css" );
	fs.unlinkSync( "allJS.js" );
	return [
		formatLines( headerLines ) + "\n",
		`<style>\n${ cssMin }</style>\n`,
		formatLines( bodyLines ) + "\n",
		info.splashScreen && await readFile( info.splashScreen ),
		`<script>\n${ jsMin }</script>\n`,
		formatLines( endLines ),
	].filter( Boolean ).join( "" )
		.replaceAll( "{{GSDAW-VERSION}}", info.version )
		.replaceAll( "//localhost/gridsound/api.gridsound.com/compositions/", "//compositions.gridsound.com/" )
		.replaceAll( "//localhost/gridsound/api.gridsound.com/api/", "//api.gridsound.com/" )
		.replaceAll( "//localhost/gridsound/daw/", "//daw.gridsound.com/" );
}

// .............................................................................
const formatLines = lines => lines.filter( Boolean ).join( "\n" );
const formatScript = s => `<script src="${ s }"></script>\n`;
const formatStyle = s => `<link rel="stylesheet" href="${ s }"/>\n`;
const formatSep = `<!-- ${ ( new Array( 71 ) ).join( "." ) } -->\n`;

// .............................................................................
function lg( s ) {
	process.stdout.write( s );
}
function pathProd( path, prod ) {
	return prod ? path.replace( ".dev.js", ".prod.js" ) : path;
}
function readFiles( paths, prod = true ) {
	const prom = [];

	paths?.forEach( p => prom.push( readFile( p, prod ) ) );
	return Promise.all( prom ).then( arr => arr.join( "\n" ) + "\n" );
}
function readFile( path, prod = true ) {
	return new Promise( res => {
		fs.readFile( pathProd( path, prod ), "utf8", ( err, txt ) => res( txt ) );
	} );
}

// .............................................................................
function execCmd( c ) {
	return new Promise( res => exec( c, ( err, stdout, stderr ) => {
		if ( stderr ) {
			lg( stderr );
		}
		res( stdout );
	} ) );
}
function execLightningCSS( path ) {
	return execCmd( `lightningcss ${ path } --minify --nesting` );
}
function execTerser( path ) {
	return execCmd( `terser ${ path } --compress --mangle --toplevel --mangle-props "regex='^[$]'"` );
}

// .............................................................................
async function lintJS() {
	const ret = await execCmd( "eslint -c assets/eslint.config.mjs . --color" );

	lg( ret || "linting ok ✔️" );
}

// .............................................................................
switch ( process.argv[ 2 ] ) {
	default:
		lg( [
			"          ---------------------------------",
			"        .:: GridSound's build node-script ::.",
			"        -------------------------------------\n",
			"node build.mjs dev -------> create 'index.html' for dev (../Submodules/files)",
			"node build.mjs dev-main --> create 'index.html' for dev (./Submodules/files)",
			"node build.mjs prod ------> create 'index-prod.html' for production",
			"node build.mjs dep -------> update all submodules",
			"node build.mjs lintJS ----> check the JS files",
		].join( "\n" ) );
		break;
	case "lintJS": lintJS(); break;
	case "prod":
		lg( "writing 'index-prod.html'... " );
		fs.writeFileSync( "index-prod.html", await writeProFile() );
		lg( "done" );
		break;
	case "dev-main":
		lg( "writing 'index.html'... " );
		fs.writeFileSync( "index.html", await writeDevFile() );
		lg( "done" );
		break;
	case "dev":
		lg( "writing 'index.html'... " );
		fs.writeFileSync( "index.html", await writeDevFile( "../" ) );
		lg( "done" );
		break;
	case "dep":
		lg( "updating git submodules... " );
		await execCmd( "git submodule init" );
		await execCmd( "git submodule update --remote" );
		await execCmd( "cp gs-wa-components/gswaCrossfade/gswaCrossfadeProc.js ." );
		lg( "done" );
		break;
}

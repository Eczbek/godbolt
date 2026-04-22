import { AnsiUp } from 'https://cdn.jsdelivr.net/npm/ansi_up@6.0.6/ansi_up.js';

function debounce(wait, func) {
	let timeout;
	return (...args) => {
		clearTimeout(timeout);
		timeout = setTimeout(() => func.apply(this, args), wait);
	};
}

const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');
const status = document.querySelector('#status');
const source = document.querySelector('#source');
const output = document.querySelector('#output > pre > code');
const flags = document.querySelector('#flags');
const recompile = document.querySelector('#recompile');
const lang_select = document.querySelector('#lang-select');
const compiler_select = document.querySelector('#compiler-select');
const libs_select = document.querySelector('#libs-select');
const short_link = document.querySelector('#short-link');

require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.39.0/min/vs' }});

for (const tab of tabs) {
	tab.addEventListener('click', () => {
		for (const tab of tabs) {
			tab.classList.remove('active');
		}
		tab.classList.add('active');
		for (const panel of panels) {
			panel.classList.toggle('active', panel.id === tab.dataset.target);
		}
	});
}

const config = {
	code: '',
	lang: 'c++',
	compilers: {
		'c++': 'gsnapshot',
		'c': 'cgsnapshot'
	},
	libs: {},
	flags: {
		'gsnapshot': '-std=c++26 -freflection -Wall -Wextra -Wpedantic -Wconversion -Wsign-conversion',
		'clang_trunk': '-std=c++26 -Wall -Wextra -Wpedantic -Wconversion -Wsign-conversion',
		'cgsnapshot': '-std=c2y -Wall -Wextra -Wpedantic -Wconversion -Wsign-conversion'
	},
	...(JSON.parse(localStorage.getItem('config')) ?? {})
};

const monaco_lang_overrides = {
	'c++': 'cpp'
};

require(['vs/editor/editor.main'], async () => {
	if (new URL(location).searchParams.has('z')) {
		try {
			const session = (await (await fetch(`https://godbolt.org/api/shortlinkinfo/${new URL(location).searchParams.get('z')}`)).json()).sessions[0];
			config.code = session.source;
			config.lang = session.language;
			if (session.compilers.length) {
				config.compilers[config.lang] = session.compilers[0].id;
			}
			for (const compiler of session.compilers) {
				config.flags[compiler.id] = compiler.options;
			}
		} catch {}
	}
	flags.value = config.flags[config.compilers[config.lang]];

	const langs = await (await fetch('https://godbolt.org/api/languages', { headers: { 'Accept': 'application/json' } })).json();
	for (const lang of langs) {
		const option = document.createElement('option');
		option.innerText = lang.name;
		if (lang.id === config.lang) {
			option.selected = true;
		}
		lang_select.appendChild(option);
	}
	let compilers = {};
	let libs = [];
	const editor = monaco.editor.create(source, {
		language: monaco_lang_overrides[config.lang] ?? config.lang,
		value: config.code,
		theme: 'vs-dark',
		automaticLayout: true,
		lineNumbersMinChars: 1,
		lineDecorationsWidth: 0,
		minimap: { enabled: false }
	});
	async function load_language_things() {
		compilers = await (await fetch(`https://godbolt.org/api/compilers/${config.lang}`, { headers: { 'Accept': 'application/json' } })).json();
		while (compiler_select.lastElementChild) {
			compiler_select.removeChild(compiler_select.lastElementChild);
		}
		if (!config.compilers[config.lang]) {
			compiler_select.appendChild(document.createElement('option'));
		}
		for (const compiler of compilers) {
			const option = document.createElement('option');
			option.innerText = compiler.name;
			if (compiler.id === config.compilers[config.lang]) {
				option.selected = true;
			}
			compiler_select.appendChild(option);
		}
		libs = await (await fetch(`https://godbolt.org/api/libraries/${config.lang}`, { headers: { 'Accept': 'application/json' } })).json();
		while (libs_select.lastElementChild) {
			libs_select.removeChild(libs_select.lastElementChild);
		}
		for (const lib of libs) {
			const div = document.createElement('div');
			const name = document.createElement('span');
			name.innerText = lib.name + ' ';
			div.appendChild(name);
			const versions = document.createElement('select');
			versions.appendChild(document.createElement('option'));
			for (const { version } of lib.versions) {
				const option = document.createElement('option');
				option.innerText = version;
				if (config.libs[config.lang]?.[lib.id] === version) {
					option.selected = true;
				}
				versions.appendChild(option);
			}
			div.appendChild(versions);
			libs_select.appendChild(div);
		}
	}
	let current_promise;
	let next_promise;
	async function compile() {
		function get_promise() {
			return new Promise(async (resolve) => {
				const request = {
					source: config.code,
					options: {
						userArguments: config.flags[config.compilers[config.lang]],
						filters: {
							execute: true
						},
						libraries: Object.entries(config.libs[config.lang] ?? {}).map(([id, version]) => ({ id, version }))
					}
				};
				status.innerText = 'Compiling...';
				const result = await (await fetch(`https://godbolt.org/api/compiler/${config.compilers[config.lang]}/compile`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Accept': 'application/json'
					},
					body: JSON.stringify(request)
				})).json();
				let output_text = [];
				if (result.stderr.length) {
					output_text.push(result.stderr.map(({ text }) => text).join('\n'));
				}
				if (result.timedOut) {
					output_text.push('<Compiler timed out>');
				} else if (result.code) {
					output_text.push(`Compiler returned: ${result.code}`);
				} else if (result.execResult?.timedOut) {
					output_text.push('<Program timed out>');
				} else if (result.execResult) {
					output_text.push(result.execResult.stdout.map(({ text }) => text).join('\n') || '<No program output>');
					output_text.push(`Program returned: ${result.execResult.code}`);
				}
				output.innerHTML = new AnsiUp().ansi_to_html(output_text.join('\n\n'));
				status.innerText = 'Output';
				resolve();
			});
		}
		if (!config.compilers[config.lang]) {
			return;
		}
		localStorage.setItem('config', JSON.stringify({
			code: config.code,
			lang: config.lang,
			compilers: config.compilers,
			libs: config.libs,
			flags: config.flags
		}));
		if (!current_promise) {
			current_promise = get_promise();
			await current_promise;
			current_promise = next_promise;
			next_promise = null;
			await current_promise;
		} else {
			next_promise = get_promise();
		}
	}
	const compile_debounce = debounce(1000, compile);

	lang_select.addEventListener('change', async () => {
		config.lang = langs[lang_select.selectedIndex].id;
		load_language_things();
		editor.getModel().setLanguage(monaco_lang_overrides[config.lang] ?? config.lang);
		flags.value = config.flags[config.compilers[config.lang]] ?? '';
		if (config.compilers[config.lang]) {
			await compile();
		}
	});
	compiler_select.addEventListener('change', async () => {
		if (compiler_select.childNodes[compiler_select.selectedIndex].innerText.length) {
			if (!compiler_select.childNodes[0].innerText.length) {
				compiler_select.removeChild(compiler_select.childNodes[0]);
			}
			config.compilers[config.lang] = compilers[compiler_select.selectedIndex].id;
			flags.value = config.flags[config.compilers[config.lang]] ?? '';
			await compile();
		}
	});
	libs_select.addEventListener('change', async () => {
		config.libs[config.lang] = {};
		for (const option of document.querySelectorAll('#libs-select > div > select > option')) {
			if (option.selected && option.innerText.length) {
				config.libs[config.lang][libs.find(({ name }) => name === option.parentNode.parentNode.firstChild.innerText.trim()).id] = option.innerText;
			}
		}
		await compile();
	});
	flags.addEventListener('change', async () => {
		config.flags[config.compilers[config.lang]] = flags.value ?? '';
		await compile();
	});
	editor.onDidChangeModelContent(() => {
		config.code = editor.getValue().trim();
		const url = new URL(location);
		url.searchParams.delete('z');
		history.replaceState({}, '', url);
		compile_debounce();
	});
	recompile.addEventListener('click', async () => {
		if (config.compilers[config.lang]) {
			await compile();
		} else {
			alert('No compiler selected!');
		}
	});
	short_link.addEventListener('click', async () => {
		const url = new URL(location);
		if (url.searchParams.has('z')) {
			navigator.clipboard.writeText(`https://godbolt.org/z/${url.searchParams.get('z')}`);
		} else {
			const data = await (await fetch('https://godbolt.org/api/shortener', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'application/json'
				},
				body: JSON.stringify({
					sessions: [
						{
							language: config.lang,
							source: config.code,
							compilers: [
								{
									id: config.compilers[config.lang],
									options: config.flags[config.compilers[config.lang]],
									filters: {
										execute: true
									},
									libs: Object.entries(config.libs[config.lang] ?? {}).map(([name, ver]) => ({ name, ver })),
									specialoutputs: ['compilerOutput']
								}
							]
						}
					]
				})
			})).json();
			navigator.clipboard.writeText(data.url);
			url.searchParams.set('z', data.url.split('/').at(-1));
			history.replaceState({}, '', url);
		}
		alert(`Saved to clipboard!`);
	});

	await load_language_things();
	await compile();
});

function debounce(wait, func) {
	let timeout;
	return (...args) => {
		clearTimeout(timeout);
		timeout = setTimeout(() => func.apply(this, args), wait);
	};
}

const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');
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

const output = document.querySelector('#output > pre > code');
const status = document.querySelector('#status');

function clean_output(str) {
	const exit = 'Program returned: ' + str.split('\n# Execution result with exit code ')[1].split('\n')[0];
	let result;
	for (const delim of ['\n# Standard out:\n', '\nStandard error:\n']) {
		if (str.includes(delim)) {
			result = str.split(delim)[1];
			break;
		}
	}
	return result ? (result + '\n\n' + exit) : exit;
}

require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.39.0/min/vs' }});
require(['vs/editor/editor.main'], () => {
	const compile = debounce(1000, async (code) => {
		if (!code) {
			return;
		}
		status.innerText = 'Compiling...';
		const url = new URL(location);
		url.searchParams.set('z', btoa(code));
		history.replaceState({}, '', url);
		output.innerText = clean_output(await (await fetch('https://godbolt.org/api/compiler/gsnapshot/compile', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				source: editor.getValue(),
				options: {
					userArguments: `-std=c++26 -freflection -Wpedantic -Wall -Wextra -Wconversion -Wsign-conversion -fdiagnostics-color=never`,
					compilerOptions: {
						skipAsm: true
					},
					filters: {
						execute: true
					}
				}
			})
		})).text());
		status.innerText = 'Output';
	});

	const initial = atob(new URL(location).searchParams.get('z') || '');
	const editor = monaco.editor.create(document.querySelector('#source'), {
		language: 'cpp',
		value: initial,
		theme: 'vs-dark',
		automaticLayout: true,
		minimap: { enabled: false }
	});
	compile(initial);
	source.addEventListener('keydown', () => {
		compile(editor.getValue());
	});
});

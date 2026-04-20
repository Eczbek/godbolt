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

require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.39.0/min/vs' }});
require(['vs/editor/editor.main'], () => {
	const compile = debounce(1000, async (code) => {
		const url = new URL(location);
		if (code) {
			url.searchParams.set('z', btoa(code));
			history.replaceState({}, '', url);
		} else {
			url.searchParams.delete('z');
			history.replaceState({}, '', url);
			return;
		}
		status.innerText = 'Compiling...';
		const result = await (await fetch('https://godbolt.org/api/compiler/gsnapshot/compile', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json'
			},
			body: JSON.stringify({
				source: code,
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
		})).json();
		let output_text = [];
		if (result.stderr.length) {
			output_text.push(result.stderr.map(({ text }) => text).join('\n'));
		}
		if (result.code) {
			output_text.push(`Compiler returned: ${result.code}`);
		} else if (result.execResult) {
			output_text.push(`Program returned: ${result.execResult.code}`);
		}
		if (result.execResult?.stdout?.length) {
			output_text.push(result.execResult.stdout.join('\n'));
		}
		output.innerText = output_text.join('\n\n');
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

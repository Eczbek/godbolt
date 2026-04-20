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
const flags = document.querySelector('#flags');

require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.39.0/min/vs' }});
require(['vs/editor/editor.main'], () => {
	let compiling = false;
	async function compile() {
		if (compiling) {
			return;
		}
		compiling = true;
		const code = editor.getValue().trim();
		const url = new URL(location);
		if (code.length) {
			url.searchParams.set('z', btoa(JSON.stringify({ code, flags: flags.value })));
			history.replaceState({}, '', url);
		} else {
			url.searchParams.delete('z');
			history.replaceState({}, '', url);
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
					userArguments: `${flags.value} -fdiagnostics-color=never`,
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
		output.innerText = output_text.join('\n\n');
		status.innerText = 'Output';
		compiling = false;
	}
	const compile_debounce = debounce(1000, compile);

	let initial = {};
	try {
		initial = JSON.parse(atob(new URL(location).searchParams.get('z') || '{}'));
	} catch {}
	flags.value = initial.flags ?? '-std=c++26 -freflection -Wall -Wextra -Wpedantic -Wconversion -Wsign-conversion';
	const source = document.querySelector('#source');
	const editor = monaco.editor.create(source, {
		language: 'cpp',
		value: initial.code,
		theme: 'vs-dark',
		automaticLayout: true,
		minimap: { enabled: false }
	});
	compile(initial.code, flags.value);
	source.addEventListener('change', async () => {
		await compile_debounce(editor.getValue(), flags.value);
	});
	flags.addEventListener('change', async () => {
		await compile_debounce(editor.getValue(), flags.value);
	});
	status.addEventListener('click', async () => {
		await compile(editor.getValue(), flags.value);
	});
});

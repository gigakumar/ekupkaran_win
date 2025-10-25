const view = document.getElementById('view');
const backendHostElem = document.getElementById('backend-host');
const statusTextElem = document.getElementById('status-text');
const statusDotElem = document.getElementById('status-dot');
const statusDocsElem = document.getElementById('status-docs');
const quickActionsElem = document.getElementById('quick-actions');
const pluginListElem = document.getElementById('plugin-list');

const HOST_KEY = 'ekupkaran.backendHost';
const PREF_KEY = 'ekupkaran.preferences';

const QUICK_ACTIONS = [
	{
		label: 'Draft onboarding workflow',
		goal: 'Create a three step onboarding automation plan for a new teammate including permissions, workspace setup, and first week tasks.',
	},
	{
		label: 'Summarize latest knowledge',
		goal: 'Summarize the most recent knowledge base entries into bullet points for a weekly update.',
	},
	{
		label: 'Inbox triage assistant',
		goal: 'Plan a workflow to triage email inbox, highlight urgent items, and schedule follow-ups.',
	},
	{
		label: 'Plugin audit checklist',
		goal: 'Generate an automation plan to review installed plugins and surface permissions that require approval.',
	},
];

const defaultPreferences = {
	modelProfile: 'tinyllama',
	auditLogging: true,
	autoRefreshStatus: true,
	planDefaults: {
		temperature: 0.4,
		maxTokens: 256,
		includeKnowledge: true,
	},
};

function deepClone(value) {
	return JSON.parse(JSON.stringify(value));
}

function loadPreferences() {
	try {
		const persisted = localStorage.getItem(PREF_KEY);
		if (!persisted) {
			return deepClone(defaultPreferences);
		}
		const parsed = JSON.parse(persisted);
		return {
			...defaultPreferences,
			...parsed,
			planDefaults: {
				...defaultPreferences.planDefaults,
				...(parsed.planDefaults || {}),
			},
		};
	} catch (error) {
		console.warn('Failed to load preferences, using defaults', error);
		return deepClone(defaultPreferences);
	}
}

function savePreferences(preferences) {
	localStorage.setItem(PREF_KEY, JSON.stringify(preferences));
}

const state = {
	backendHost: '',
	route: 'dashboard',
		status: { ok: false, message: 'Waiting…', documents: null, backend: {} },
	plugins: [],
	documents: [],
	documentsLoading: false,
	selectedDocument: null,
	documentDetail: null,
	documentDetailLoading: false,
	queryHits: [],
	lastQuery: null,
	queryLoading: false,
	plan: {
		goal: '',
		actions: [],
		knowledge: [],
		loading: false,
		error: null,
		lastRunAt: null,
		params: {},
		includeKnowledge: true,
	},
	preferences: loadPreferences(),
	auditTrail: [],
	quickActionRunning: null,
};

state.plan.params = {
	temperature: state.preferences.planDefaults.temperature,
	maxTokens: state.preferences.planDefaults.maxTokens,
};
state.plan.includeKnowledge = state.preferences.planDefaults.includeKnowledge;

let statusInterval = null;

function applyBackendHost(host) {
	const fallback = window.ekupkaran.getBackendHost();
	const trimmed = (host || fallback || '').trim();
	const normalized = trimmed.replace(/\/$/, '');
	state.backendHost = normalized || fallback;
	window.ekupkaran.setBackendHost(state.backendHost);
	localStorage.setItem(HOST_KEY, state.backendHost);
	backendHostElem.textContent = state.backendHost;
}

function hydrateBackendHost() {
	const persisted = localStorage.getItem(HOST_KEY);
	applyBackendHost(persisted || window.ekupkaran.getBackendHost());
}

function updateStatusIndicator() {
	statusTextElem.textContent = state.status.message;
	statusDocsElem.textContent =
		typeof state.status.documents === 'number' ? state.status.documents : '–';
	statusDotElem.style.background = state.status.ok ? '#22c55e' : '#f97316';
}

async function refreshStatus({ silent = false } = {}) {
	try {
		const data = await window.ekupkaran.request('/health', { method: 'GET' });
		state.status = {
			ok: true,
			message: 'Online',
			documents: data.documents ?? data.document_count ?? 0,
			backend: data.backend || {},
		};
		updateStatusIndicator();
		if (!silent && state.route === 'dashboard') {
			renderDashboard();
		}
	} catch (error) {
		const message = error?.payload?.error || error?.message || String(error);
		state.status = {
			ok: false,
			message: `Offline · ${message}`,
				documents: null,
				backend: {},
		};
		updateStatusIndicator();
		if (!silent && state.route === 'dashboard') {
			renderDashboard();
		}
	}
}

async function loadPlugins() {
	try {
		const data = await window.ekupkaran.request('/plugins', { method: 'GET' });
		state.plugins = Array.isArray(data.plugins) ? data.plugins : [];
	} catch (error) {
		console.warn('Failed to load plugins', error);
		state.plugins = [];
	}
	renderPlugins();
}

async function loadDocuments() {
	state.documentsLoading = true;
	renderKnowledge();
	try {
		const data = await window.ekupkaran.request('/documents', { method: 'GET' });
		state.documents = Array.isArray(data.documents) ? data.documents : [];
	} catch (error) {
		console.warn('Failed to load documents', error);
		state.documents = [];
	} finally {
		state.documentsLoading = false;
		if (state.route === 'knowledge') {
			renderKnowledge();
		}
	}
}

async function fetchDocumentDetail(id) {
	if (!id) {
		state.selectedDocument = null;
		state.documentDetail = null;
		renderKnowledge();
		return;
	}
	state.documentDetailLoading = true;
	state.selectedDocument = id;
	renderKnowledge();
	try {
		const data = await window.ekupkaran.request(`/documents/${id}`, { method: 'GET' });
		state.documentDetail = data;
	} catch (error) {
		console.warn('Failed to fetch document', error);
		state.documentDetail = { error: error?.message || 'Unable to load document.' };
	} finally {
		state.documentDetailLoading = false;
		if (state.route === 'knowledge') {
			renderKnowledge();
		}
	}
}

async function deleteDocument(id) {
	if (!id) {
		return;
	}
	const confirmDelete = confirm('Delete this document from the knowledge base?');
	if (!confirmDelete) {
		return;
	}
	try {
		await window.ekupkaran.request(`/documents/${id}`, { method: 'DELETE' });
		if (state.selectedDocument === id) {
			state.selectedDocument = null;
			state.documentDetail = null;
		}
		await loadDocuments();
		await loadAudit({ silent: true });
	} catch (error) {
		alert(error?.payload?.error || error?.message || 'Failed to delete document.');
	}
}

async function queryKnowledge(query, limit = 5) {
	state.queryLoading = true;
	renderKnowledge();
	try {
		const data = await window.ekupkaran.request('/query', {
			method: 'POST',
			body: JSON.stringify({ query, limit }),
		});
		state.queryHits = Array.isArray(data.hits) ? data.hits : [];
		state.lastQuery = { query, limit, ts: Date.now() };
	} catch (error) {
		console.warn('Query failed', error);
		state.queryHits = [];
		state.lastQuery = { query, limit, ts: Date.now(), error: error?.message };
	} finally {
		state.queryLoading = false;
		if (state.route === 'knowledge') {
			renderKnowledge();
		} else if (state.route === 'dashboard') {
			renderDashboard();
		}
	}
}

async function loadAudit({ silent = false } = {}) {
	if (!state.preferences.auditLogging) {
		state.auditTrail = [];
		if (!silent && state.route === 'dashboard') {
			renderDashboard();
		}
		return;
	}
	try {
		const data = await window.ekupkaran.request('/audit', { method: 'GET' });
		const events = Array.isArray(data.events) ? data.events : [];
		state.auditTrail = events.slice(-12).reverse();
	} catch (error) {
		console.warn('Failed to load audit trail', error);
		state.auditTrail = [];
	}
	if (!silent && state.route === 'dashboard') {
		renderDashboard();
	}
}

async function logPlan(goal, actions, metadata = {}) {
	if (!state.preferences.auditLogging) {
		return;
	}
	try {
		await window.ekupkaran.request('/audit', {
			method: 'POST',
			body: JSON.stringify({
				type: 'plan_generated',
				ts: Date.now(),
				goal,
				actions,
				metadata,
			}),
		});
	} catch (error) {
		console.warn('Failed to record audit event', error);
	}
}

async function runPlan(goal, params, includeKnowledge, metadata = {}) {
	if (!goal?.trim()) {
		return;
	}
	state.plan.loading = true;
	state.plan.error = null;
	renderPlanner();

	let knowledgeHits = [];
	if (includeKnowledge) {
		try {
			const queryData = await window.ekupkaran.request('/query', {
				method: 'POST',
				body: JSON.stringify({ query: goal, limit: 3 }),
			});
			knowledgeHits = Array.isArray(queryData.hits) ? queryData.hits : [];
		} catch (error) {
			console.warn('Knowledge grounding failed', error);
		}
	}

	const enrichedGoal =
		includeKnowledge && knowledgeHits.length
			? `${goal}\n\nContext:\n${knowledgeHits
					.map((hit, idx) => `${idx + 1}. ${hit.preview ?? hit.doc_id ?? ''}`)
					.join('\n')}`
			: goal;

	try {
		const data = await window.ekupkaran.request('/plan', {
			method: 'POST',
			body: JSON.stringify({
				goal: enrichedGoal,
				params: {
					temperature: params.temperature,
					max_tokens: params.maxTokens,
				},
			}),
		});
		const actions = Array.isArray(data.actions) ? data.actions : [];
		state.plan = {
			...state.plan,
			goal,
			actions,
			knowledge: knowledgeHits,
			loading: false,
			error: null,
			lastRunAt: Date.now(),
			params: { ...params },
			includeKnowledge,
		};
		await logPlan(goal, actions, { ...metadata, includeKnowledge, params });
		await loadAudit({ silent: true });
	} catch (error) {
		const message = error?.payload?.error || error?.message || 'Plan failed';
		state.plan.loading = false;
		state.plan.error = message;
	}

	if (state.route === 'planner') {
		renderPlanner();
	} else if (state.route === 'dashboard') {
		renderDashboard();
	}
}

function renderPlugins() {
	pluginListElem.innerHTML = '';
	if (!state.plugins.length) {
		const empty = document.createElement('li');
		empty.textContent = 'No plugins discovered';
		pluginListElem.appendChild(empty);
		return;
	}
	state.plugins.forEach((plugin) => {
		const item = document.createElement('li');
		const name = plugin.name || plugin.title || plugin.id || 'Plugin';
		const version = plugin.version ? ` · v${plugin.version}` : '';
		item.textContent = `${name}${version}`;
		pluginListElem.appendChild(item);
	});
}

function renderQuickActions() {
	quickActionsElem.innerHTML = '';
	QUICK_ACTIONS.forEach((action) => {
		const btn = document.createElement('button');
		btn.textContent = action.label;
		btn.disabled = state.quickActionRunning === action.label;
		btn.addEventListener('click', async () => {
			state.quickActionRunning = action.label;
			renderQuickActions();
			await navTo('planner');
			document.getElementById('plan-goal').value = action.goal;
			await runPlan(action.goal, state.plan.params, state.plan.includeKnowledge, {
				source: 'quick-action',
				label: action.label,
			});
			state.quickActionRunning = null;
			renderQuickActions();
		});
		quickActionsElem.appendChild(btn);
	});
}

function formatTimestamp(ts) {
	if (!ts) {
		return '—';
	}
	try {
		const date = new Date(ts);
		return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
	} catch {
		return String(ts);
	}
}

function renderDashboard() {
	const lastPlanActions =
		state.plan.actions && state.plan.actions.length
			? state.plan.actions
			: null;
	const lastQueryHits =
		state.queryHits && state.queryHits.length ? state.queryHits.slice(0, 5) : [];
		const pluginCount = state.status.backend?.plugins ?? state.plugins.length ?? 0;

	view.innerHTML = `
		<section class="grid two">
			<div>
				<h2>Automation overview</h2>
				<p class="muted">Connected to <strong>${state.backendHost}</strong></p>
				<div class="metric-group">
					<div><strong>${state.status.ok ? 'Online' : 'Offline'}</strong><br /><small>Status</small></div>
					<div><strong>${
						typeof state.status.documents === 'number' ? state.status.documents : '—'
						}</strong><br /><small>Documents indexed</small></div>
						<div><strong>${state.preferences.modelProfile}</strong><br /><small>Model profile</small></div>
						<div><strong>${pluginCount}</strong><br /><small>Plugins detected</small></div>
				</div>
				<h3>Recent knowledge hits</h3>
				${
					lastQueryHits.length
						? `<ul class="list">
								${lastQueryHits
									.map(
										(hit) => `
										<li class="list-item">
											<strong>Score:</strong> ${(hit.score ?? 0).toFixed(2)}<br />
											${hit.preview || hit.doc_id || 'Document'}
										</li>`
									)
									.join('')}
							</ul>`
						: '<p class="muted">Run a knowledge query to see results here.</p>'
				}
			</div>
			<div>
				<h3>Latest plan</h3>
				${
					state.plan.loading
						? '<p>Generating plan…</p>'
						: lastPlanActions
						? `
							<p class="muted">Goal: ${state.plan.goal || '—'}</p>
							<table>
								<thead><tr><th>#</th><th>Action</th><th>Sensitive</th></tr></thead>
								<tbody>
									${lastPlanActions
										.map(
											(action, idx) => `
												<tr>
													<td>${idx + 1}</td>
													<td>${action.name || 'action'}<br /><small>${
														action.payload || ''
													}</small></td>
													<td>${action.sensitive ? 'Yes' : 'No'}</td>
												</tr>`
										)
										.join('')}
								</tbody>
							</table>
							<p class="muted">Generated at ${formatTimestamp(state.plan.lastRunAt)}</p>
						`
						: '<p class="muted">Generate a plan to see results.</p>'
				}
			</div>
		</section>
		<section>
			<h3>Audit trail</h3>
			${
				state.auditTrail && state.auditTrail.length
					? `<ul class="list">
							${state.auditTrail
								.slice(0, 6)
								.map(
									(event) => `
										<li class="list-item">
											<strong>${event.type || 'event'}</strong> · ${formatTimestamp(
												event.ts
											)}
											<br />
											<small>${(event.goal || event.message || '')
												.toString()
												.slice(0, 160)}</small>
										</li>`
								)
								.join('')}
						</ul>`
					: '<p class="muted">Audit events will appear here when logging is enabled.</p>'
			}
		</section>
	`;
}

function renderKnowledge() {
	const documentsList = state.documents
		.map(
			(doc) => `
					<div class="list-item ${
						state.selectedDocument === doc.id ? 'active' : ''
					}" data-doc-id="${doc.id}">
						<div class="item-row">
							<div>
								<strong>${doc.source || 'document'}</strong>
								<span class="badge">${new Date(doc.ts * 1000).toLocaleTimeString()}</span>
							</div>
							<button class="btn-danger" data-action="delete" data-doc-id="${doc.id}">Delete</button>
						</div>
						<div>${doc.preview || ''}</div>
				</div>`
		)
		.join('');

	const queryResults = state.queryHits
		.map(
			(hit, idx) => `
				<div class="list-item">
					<strong>${idx + 1}. score ${(hit.score ?? 0).toFixed(2)}</strong>
					<div>${hit.preview || hit.doc_id || '—'}</div>
				</div>`
		)
		.join('');

	view.innerHTML = `
		<section class="grid two knowledge">
			<div>
				<h2>Knowledge console</h2>
				<form id="index-form">
					<label for="index-text">Snippet</label>
					<textarea id="index-text" rows="6" placeholder="Paste a snippet to index"></textarea>
					<label for="index-source">Source label</label>
					<input id="index-source" placeholder="docs/manual" />
					<button type="submit" class="btn-primary">Index snippet</button>
				</form>
				<h3>Documents</h3>
				${state.documentsLoading ? '<p>Loading documents…</p>' : documentsList ? `<div id="documents-list" class="list">${documentsList}</div>` : '<p class="muted">No documents indexed yet.</p>'}
			</div>
			<div>
				<h3>Document detail</h3>
				${
					state.documentDetailLoading
						? '<p>Loading…</p>'
						: state.documentDetail
						? state.documentDetail.error
							? `<p class="error">${state.documentDetail.error}</p>`
							: `<pre>${state.documentDetail.text || JSON.stringify(state.documentDetail, null, 2)}</pre>`
						: '<p class="muted">Select a document to view its full text.</p>'
				}
			</div>
		</section>
		<section>
			<h3>Semantic search</h3>
			<form id="query-form" class="grid two">
				<div>
					<label for="query-input">Query</label>
					<input id="query-input" placeholder="What would you like to find?" />
				</div>
				<div>
					<label for="query-limit">Results</label>
					<input id="query-limit" type="number" min="1" max="20" value="5" />
				</div>
				<div>
					<button type="submit" class="btn-primary">Run search</button>
				</div>
			</form>
			${
				state.queryLoading
					? '<p>Searching…</p>'
					: queryResults
					? `<div class="list">${queryResults}</div>`
					: '<p class="muted">No results yet. Run a query to populate this section.</p>'
			}
		</section>
	`;

	const indexForm = document.getElementById('index-form');
	indexForm.addEventListener('submit', async (event) => {
		event.preventDefault();
		const text = document.getElementById('index-text').value.trim();
		const source = document.getElementById('index-source').value.trim() || 'api';
		if (!text) {
			alert('Please provide text to index.');
			return;
		}
		try {
			await window.ekupkaran.request('/index', {
				method: 'POST',
				body: JSON.stringify({ text, source }),
			});
			document.getElementById('index-text').value = '';
			await loadDocuments();
			await loadAudit({ silent: true });
		} catch (error) {
			alert(error?.message || 'Failed to index snippet');
		}
	});

	const documentsListElem = document.getElementById('documents-list');
	if (documentsListElem) {
		documentsListElem.addEventListener('click', (event) => {
				const button = event.target.closest('[data-action]');
				if (button && button.dataset.action === 'delete') {
					event.stopPropagation();
					const docId = button.dataset.docId;
					if (docId) {
						deleteDocument(docId);
					}
					return;
				}
				const target = event.target.closest('[data-doc-id]');
				if (target) {
					fetchDocumentDetail(target.dataset.docId);
			}
		});
	}

	const queryForm = document.getElementById('query-form');
	queryForm.addEventListener('submit', async (event) => {
		event.preventDefault();
		const query = document.getElementById('query-input').value.trim();
		const limit = parseInt(document.getElementById('query-limit').value, 10) || 5;
		if (!query) {
			alert('Enter a query to search the knowledge base.');
			return;
		}
		await queryKnowledge(query, limit);
	});
}

function renderPlanner() {
	view.innerHTML = `
		<section class="grid two planner">
			<div>
				<h2>Planner</h2>
				<form id="plan-form">
					<label for="plan-goal">Goal</label>
					<textarea id="plan-goal" rows="4" placeholder="Describe the automation you want to create">${
						state.plan.goal || ''
					}</textarea>
					<label for="plan-temperature">Temperature <span id="plan-temp-display">${
						state.plan.params.temperature.toFixed(1)
					}</span></label>
					<input id="plan-temperature" type="range" min="0" max="1" step="0.1" value="${
						state.plan.params.temperature
					}" />
					<label for="plan-max-tokens">Token budget <span id="plan-token-display">${
						state.plan.params.maxTokens
					}</span></label>
					<input id="plan-max-tokens" type="range" min="64" max="1024" step="64" value="${
						state.plan.params.maxTokens
					}" />
					<label class="toggle">
						<input id="plan-include-knowledge" type="checkbox" ${
							state.plan.includeKnowledge ? 'checked' : ''
						} />
						Ground with knowledge base
					</label>
					<button type="submit" class="btn-primary">Generate plan</button>
				</form>
			</div>
			<div>
				<h3>Result</h3>
				${
					state.plan.loading
						? '<p>Generating plan…</p>'
						: state.plan.error
						? `<p class="error">${state.plan.error}</p>`
						: state.plan.actions.length
						? `
							<table>
								<thead><tr><th>#</th><th>Action</th><th>Preview required</th></tr></thead>
								<tbody>
									${state.plan.actions
										.map(
											(action, idx) => `
												<tr>
													<td>${idx + 1}</td>
													<td>${action.name || 'action'}<br /><small>${
														action.payload || ''
													}</small></td>
													<td>${action.preview_required ? 'Yes' : 'No'}</td>
												</tr>`
										)
										.join('')}
								</tbody>
							</table>
							<p class="muted">Generated at ${formatTimestamp(state.plan.lastRunAt)}</p>
						`
						: '<p class="muted">Fill out the form and generate a plan.</p>'
				}
				${
					state.plan.knowledge && state.plan.knowledge.length
						? `
							<h4>Knowledge grounding</h4>
							<ul class="list">
								${state.plan.knowledge
									.map(
										(hit, idx) => `
											<li class="list-item">
												<strong>${idx + 1}. ${(hit.score ?? 0).toFixed(2)}</strong>
												<div>${hit.preview || hit.doc_id || ''}</div>
											</li>`
									)
									.join('')}
							</ul>
						`
						: ''
				}
			</div>
		</section>
	`;

	const planForm = document.getElementById('plan-form');
	const tempRange = document.getElementById('plan-temperature');
	const tempDisplay = document.getElementById('plan-temp-display');
	const tokenRange = document.getElementById('plan-max-tokens');
	const tokenDisplay = document.getElementById('plan-token-display');
	const includeKnowledge = document.getElementById('plan-include-knowledge');

	tempRange.addEventListener('input', () => {
		tempDisplay.textContent = Number(tempRange.value).toFixed(1);
	});
	tokenRange.addEventListener('input', () => {
		tokenDisplay.textContent = Number(tokenRange.value);
	});

	includeKnowledge.addEventListener('change', () => {
		state.plan.includeKnowledge = includeKnowledge.checked;
		state.preferences.planDefaults.includeKnowledge = includeKnowledge.checked;
		savePreferences(state.preferences);
	});

	planForm.addEventListener('submit', async (event) => {
		event.preventDefault();
		const goal = document.getElementById('plan-goal').value.trim();
		state.plan.params = {
			temperature: Number(tempRange.value),
			maxTokens: Number(tokenRange.value),
		};
		state.preferences.planDefaults.temperature = state.plan.params.temperature;
		state.preferences.planDefaults.maxTokens = state.plan.params.maxTokens;
		savePreferences(state.preferences);
		await runPlan(goal, state.plan.params, includeKnowledge.checked, {
			source: 'planner',
		});
	});
}

function renderSettings() {
	view.innerHTML = `
		<section class="settings">
			<h2>Settings</h2>
			<form id="host-form" class="grid two">
				<div>
					<label for="host-input">Backend host</label>
					<input id="host-input" value="${state.backendHost}" />
					<small class="muted">Typically the automation daemon http endpoint (default http://127.0.0.1:9000)</small>
				</div>
				<div class="settings-actions">
					<button type="submit" class="btn-primary">Save</button>
					<button type="button" id="test-connection" class="btn-secondary">Test connection</button>
				</div>
			</form>
			<div class="grid two">
				<div>
					<h3>Model profile</h3>
					<select id="profile-select">
						<option value="tinyllama">TinyLlama (bundled)</option>
						<option value="ollama">Ollama host</option>
						<option value="openai">OpenAI GPT-4o-mini</option>
					</select>
					<p class="muted">Profile selection is persisted locally; ensure backend config matches.</p>
				</div>
				<div>
					<h3>Preferences</h3>
					<label class="toggle">
						<input id="pref-audit" type="checkbox" ${state.preferences.auditLogging ? 'checked' : ''} />
						Audit log plan events
					</label>
					<label class="toggle">
						<input id="pref-auto-refresh" type="checkbox" ${state.preferences.autoRefreshStatus ? 'checked' : ''} />
						Auto-refresh status every 30s
					</label>
					<button type="button" id="reset-preferences" class="btn-secondary">Reset to defaults</button>
				</div>
			</div>
		</section>
	`;

	const hostForm = document.getElementById('host-form');
	const hostInput = document.getElementById('host-input');
	const testButton = document.getElementById('test-connection');
	const profileSelect = document.getElementById('profile-select');
	const auditToggle = document.getElementById('pref-audit');
	const autoRefreshToggle = document.getElementById('pref-auto-refresh');
	const resetPreferencesBtn = document.getElementById('reset-preferences');

	profileSelect.value = state.preferences.modelProfile;

	hostForm.addEventListener('submit', (event) => {
		event.preventDefault();
		applyBackendHost(hostInput.value);
		refreshStatus();
		alert('Backend host updated.');
	});

	testButton.addEventListener('click', async () => {
		try {
			await refreshStatus();
			alert(state.status.ok ? 'Backend reachable!' : 'Backend still offline.');
		} catch (error) {
			alert(error?.message || 'Unable to reach backend.');
		}
	});

	profileSelect.addEventListener('change', () => {
		state.preferences.modelProfile = profileSelect.value;
		savePreferences(state.preferences);
		if (state.route === 'dashboard') {
			renderDashboard();
		}
	});

	auditToggle.addEventListener('change', async () => {
		state.preferences.auditLogging = auditToggle.checked;
		savePreferences(state.preferences);
		if (state.preferences.auditLogging) {
			await loadAudit({ silent: true });
		} else {
			state.auditTrail = [];
		}
		if (state.route === 'dashboard') {
			renderDashboard();
		}
	});

	autoRefreshToggle.addEventListener('change', () => {
		state.preferences.autoRefreshStatus = autoRefreshToggle.checked;
		savePreferences(state.preferences);
		ensureAutoRefresh();
	});

	resetPreferencesBtn.addEventListener('click', () => {
		state.preferences = deepClone(defaultPreferences);
		savePreferences(state.preferences);
		state.plan.params = { ...state.preferences.planDefaults };
		state.plan.includeKnowledge = state.preferences.planDefaults.includeKnowledge;
		renderSettings();
		ensureAutoRefresh();
		renderPlanner();
		if (state.route === 'dashboard') {
			renderDashboard();
		}
	});
}

async function navTo(route) {
	state.route = route;
	if (route === 'dashboard') {
		renderDashboard();
	} else if (route === 'knowledge') {
		renderKnowledge();
		if (!state.documents.length) {
			await loadDocuments();
		}
	} else if (route === 'planner') {
		renderPlanner();
	} else if (route === 'settings') {
		renderSettings();
	}
}

function ensureAutoRefresh() {
	if (statusInterval) {
		clearInterval(statusInterval);
		statusInterval = null;
	}
	if (state.preferences.autoRefreshStatus) {
		statusInterval = setInterval(() => refreshStatus({ silent: true }), 30000);
	}
}

function attachGlobalListeners() {
	document.getElementById('status-refresh').addEventListener('click', () => refreshStatus());
	document.getElementById('open-docs').addEventListener('click', () => {
		window.ekupkaran.openExternal('https://github.com/gigakumar/ekupkaran');
	});

	document.querySelectorAll('nav button').forEach((button) => {
		button.addEventListener('click', () => {
			const route = button.getAttribute('data-route');
			navTo(route);
		});
	});
}

async function init() {
	hydrateBackendHost();
	renderQuickActions();
	attachGlobalListeners();
	updateStatusIndicator();
	ensureAutoRefresh();
	await refreshStatus({ silent: true });
	await loadPlugins();
	await loadAudit({ silent: true });
	await navTo('dashboard');
}

init();

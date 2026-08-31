(function () {
    const STORAGE_KEY = 'espellbook_spellbook';
    const PREPARED_KEY = 'espellbook_prepared';
    const SHEET_KEY = 'espellbook_sheet';
    const SPELLS_BY_ID = new Map(SPELLS.map(spell => [spell.id, spell]));
    const ALL_SOURCES = [...new Set(SPELLS.map(spell => spell.source).filter(Boolean))];
    const ALL_BOOK_SOURCES = [...new Set(SPELLS.map(spell => spell.book_source).filter(Boolean))].sort();
    let SHEET_CHARACTER = null;

    function deepMerge(target, source) {
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!target[key] || typeof target[key] !== 'object') target[key] = {};
                deepMerge(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
        return target;
    }

    function loadSheetData() {
        try {
            const saved = JSON.parse(localStorage.getItem(SHEET_KEY));
            if (saved) {
                const base = JSON.parse(JSON.stringify(CHARACTER));
                return deepMerge(base, saved);
            }
        } catch {}
        return JSON.parse(JSON.stringify(CHARACTER));
    }

    function saveSheetData() {
        localStorage.setItem(SHEET_KEY, JSON.stringify(SHEET_CHARACTER));
    }

    function initSheetCharacter() {
        SHEET_CHARACTER = loadSheetData();
    }

    function setupTabs() {
        const buttons = document.querySelectorAll('.tab-btn');
        const contents = document.querySelectorAll('.tab-content');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                buttons.forEach(b => b.classList.remove('active'));
                contents.forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(tab).classList.add('active');
                if (tab === 'spellbook') renderSpellbook();
                if (tab === 'char') renderCharSheet();
                if (tab === 'sheet') renderSheetEditor();
            });
        });
    }

    function getSpellbook() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        } catch {
            return [];
        }
    }

    function saveSpellbook(list) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }

    function findSpell(id) {
        return SPELLS_BY_ID.get(Number(id));
    }

    function migrateSpellRefs(list) {
        let changed = false;
        const migrated = list.map(ref => {
            const numericId = typeof ref === 'number' ? ref : Number(ref);
            if (Number.isInteger(numericId) && SPELLS_BY_ID.has(numericId)) {
                if (ref !== numericId) changed = true;
                return numericId;
            }
            if (typeof ref !== 'string') return ref;
            const matches = SPELLS.filter(spell => spell.name === ref).sort((a, b) => a.id - b.id);
            if (!matches.length) return ref;
            changed = true;
            return matches[0].id;
        });
        const unique = [...new Set(migrated)];
        return { list: unique, changed: changed || unique.length !== list.length };
    }

    function migrateSavedSpellRefs() {
        [[getSpellbook, saveSpellbook], [getPrepared, savePrepared]].forEach(([load, save]) => {
            const migration = migrateSpellRefs(load());
            if (migration.changed) save(migration.list);
        });
    }

    function getLevel(spell) {
        return spell.level;
    }

    function getSchool(spell) {
        const school = spell.school || 'Unknown';
        return school.charAt(0).toUpperCase() + school.slice(1).toLowerCase();
    }

    function formatLevelSchool(spell) {
        if (spell.level === 0) return `${getSchool(spell)} Cantrip`;
        return `Level ${spell.level} ${getSchool(spell)}`;
    }

    function levelTitle(level) {
        if (level === 0) return 'Cantrips';
        return `Level ${level}`;
    }

    function evaluateFormula(formula, level) {
        const attrs = SHEET_CHARACTER.attributes || {};
        const vars = { level };
        for (const [key, score] of Object.entries(attrs)) {
            vars[`${key}_modifier`] = getAbilityModifier(score);
        }
        const expr = formula
            .replace(/(\w+)/g, (match) => (vars[match] !== undefined ? vars[match] : match))
            .replace(/floor/g, 'Math.floor')
            .replace(/ceil/g, 'Math.ceil');
        try {
            return Function('"use strict"; return (' + expr + ')')() || 0;
        } catch {
            return 0;
        }
    }

    function getTotalPreparedCap() {
        const cls = getPrimaryClass();
        if (!cls) return 0;
        const level = getCharacterLevel();
        const progression = cls.progression && cls.progression[String(level)];
        if (!progression) return 0;
        if (cls.prepared_caster && cls.spells_prepared_formula) {
            return evaluateFormula(cls.spells_prepared_formula, level);
        }
        return progression.spells_known || 0;
    }

    function getPreparedCap(level) {
        const mods = (SHEET_CHARACTER.custom_mods && SHEET_CHARACTER.custom_mods.prepared) || {};
        const customCap = parseInt(mods[String(level)]);
        if (!isNaN(customCap) && customCap > 0) return customCap;
        return level === 0 ? 0 : getTotalPreparedCap();
    }

    function getPrepared() {
        try {
            return JSON.parse(localStorage.getItem(PREPARED_KEY)) || [];
        } catch {
            return [];
        }
    }

    function savePrepared(list) {
        localStorage.setItem(PREPARED_KEY, JSON.stringify(list));
    }

    function togglePrepared(id) {
        id = Number(id);
        const list = getPrepared();
        const idx = list.indexOf(id);
        if (idx === -1) list.push(id);
        else list.splice(idx, 1);
        savePrepared(list);
    }

    function initializeSpellbook() {
        if (INITIAL_PREPARED.length > 0 && !localStorage.getItem(STORAGE_KEY)) {
            saveSpellbook(INITIAL_PREPARED);
        }
    }

    function setupExclusiveFilterHold(container, duration = 700) {
        container.querySelectorAll('.filter-toggle').forEach(label => {
            const input = label.querySelector('input[type="checkbox"]');
            let timer = null;
            let suppressClick = false;

            const cancel = () => {
                label.classList.remove('exclusive-hold-active');
                if (!timer) return;
                clearTimeout(timer);
                timer = null;
            };

            label.addEventListener('pointerdown', event => {
                if (event.button !== 0) return;
                label.classList.add('exclusive-hold-active');
                timer = setTimeout(() => {
                    timer = null;
                    suppressClick = true;
                    label.classList.remove('exclusive-hold-active');
                    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                        checkbox.checked = checkbox === input;
                    });
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }, duration);
            });
            label.addEventListener('pointerup', () => {
                cancel();
                if (suppressClick) setTimeout(() => { suppressClick = false; }, 0);
            });
            label.addEventListener('pointercancel', cancel);
            label.addEventListener('pointerleave', cancel);
            label.addEventListener('click', event => {
                if (!suppressClick) return;
                event.preventDefault();
                event.stopImmediatePropagation();
            }, true);
        });
    }

    function renderSourceFilters() {
        const container = document.getElementById('source-filters');
        if (!container) return;
        if (ALL_SOURCES.length === 0) {
            container.style.display = 'none';
            return;
        }
        container.innerHTML = '<span class="filter-label">Source:</span>' + ALL_SOURCES.map(source => `
            <label class="filter-toggle">
                <input type="checkbox" value="${escapeHtml(source)}" checked>
                <span>${escapeHtml(source)}</span>
            </label>
        `).join('');
        setupExclusiveFilterHold(container);
    }

    function getSelectedSources() {
        const checkboxes = document.querySelectorAll('#source-filters input[type="checkbox"]');
        return Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
    }

    function renderBookSourceFilters() {
        const container = document.getElementById('book-source-filters');
        if (!container) return;
        if (ALL_BOOK_SOURCES.length === 0) {
            container.style.display = 'none';
            return;
        }
        container.innerHTML = '<span class="filter-label">Book:</span>' + ALL_BOOK_SOURCES.map(source => `
            <label class="filter-toggle">
                <input type="checkbox" value="${escapeHtml(source)}" checked>
                <span>${escapeHtml(source)}</span>
            </label>
        `).join('');
        setupExclusiveFilterHold(container);
    }

    function getSelectedBookSources() {
        const checkboxes = document.querySelectorAll('#book-source-filters input[type="checkbox"]');
        return Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
    }

    const LEVEL_FILTERS_KEY = 'espellbook_level_filters';
    const SCHOOL_FILTERS_KEY = 'espellbook_school_filters';
    const CLASS_FILTERS_KEY = 'espellbook_class_filters';
    const RITUAL_FILTERS_KEY = 'espellbook_ritual_filters';
    const RANGE_FILTERS_KEY = 'espellbook_range_filters';
    const CASTING_TIME_FILTERS_KEY = 'espellbook_casting_time_filters';

    function loadFilterState(key, defaultSelected) {
        try {
            const saved = JSON.parse(localStorage.getItem(key));
            if (saved && typeof saved === 'object') return saved;
        } catch {}
        const state = {};
        defaultSelected.forEach(v => state[v] = true);
        return state;
    }

    function saveFilterState(key, state) {
        localStorage.setItem(key, JSON.stringify(state));
    }

    function renderFilterRow(containerId, key, values, charOnlySet, renderLabel) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const state = loadFilterState(key, charOnlySet || values);
        container.innerHTML = '<span class="filter-label">' + renderLabel + ':</span>' + values.map(value => {
            const checked = state[value] ? 'checked' : '';
            return `<label class="filter-toggle"><input type="checkbox" value="${escapeHtml(value)}" ${checked}><span>${escapeHtml(value)}</span></label>`;
        }).join('');

        container.querySelectorAll('input').forEach(input => {
            input.addEventListener('change', () => {
                const newState = {};
                container.querySelectorAll('input').forEach(cb => newState[cb.value] = cb.checked);
                saveFilterState(key, newState);
                renderCatalog();
            });
        });
        setupExclusiveFilterHold(container);
    }

    function renderLevelFilters() {
        const levels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        renderFilterRow('level-filters', LEVEL_FILTERS_KEY, levels.map(String), levels.map(String), 'Level');
        const labels = document.querySelectorAll('#level-filters .filter-toggle span');
        labels.forEach((span, i) => { if (span.textContent === '0') span.textContent = 'C'; });
    }

    function renderSchoolFilters() {
        const schools = [...new Set(SPELLS.map(getSchool))].sort();
        renderFilterRow('school-filters', SCHOOL_FILTERS_KEY, schools, schools, 'School');
    }

    function renderClassFilters() {
        const charClasses = Object.keys(SHEET_CHARACTER.classes || {}).map(c => c.toLowerCase());
        const allClasses = [...new Set(SPELLS.flatMap(s => s.classes || []))];
        const classes = [...new Set([...charClasses, ...allClasses])].sort();
        const displayClasses = classes.map(c => c.charAt(0).toUpperCase() + c.slice(1));
        const defaultSelected = charClasses.length
            ? displayClasses.filter(c => charClasses.includes(c.toLowerCase()) || c.toLowerCase() === 'all')
            : displayClasses;
        renderFilterRow('class-filters', CLASS_FILTERS_KEY, displayClasses, defaultSelected, 'Class');
    }

    function getSelectedLevels() {
        const checkboxes = document.querySelectorAll('#level-filters input[type="checkbox"]');
        return Array.from(checkboxes).filter(cb => cb.checked).map(cb => parseInt(cb.value));
    }

    function getSelectedSchools() {
        const checkboxes = document.querySelectorAll('#school-filters input[type="checkbox"]');
        return Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
    }

    function getSelectedClasses() {
        const checkboxes = document.querySelectorAll('#class-filters input[type="checkbox"]');
        return Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value.toLowerCase());
    }

    function categorizeRange(range) {
        const lower = (range || '').toLowerCase().trim();
        if (lower === 'self') return 'Self';
        if (lower === 'touch') return 'Touch';
        return 'Other';
    }

    function categorizeCastingTime(ct) {
        const lower = (ct || '').toLowerCase();
        if (lower.includes('bonus action')) return 'Bonus Action';
        if (lower.includes('reaction')) return 'Reaction';
        if (lower.includes('action')) return 'Action';
        return 'Other';
    }

    function renderRitualFilters() {
        const values = ['Ritual', 'Non-ritual'];
        renderFilterRow('ritual-filters', RITUAL_FILTERS_KEY, values, values, 'Ritual');
    }

    function renderRangeFilters() {
        const values = ['Self', 'Touch', 'Other'];
        renderFilterRow('range-filters', RANGE_FILTERS_KEY, values, values, 'Range');
    }

    function renderCastingTimeFilters() {
        const values = ['Action', 'Bonus Action', 'Reaction', 'Other'];
        renderFilterRow('casting-time-filters', CASTING_TIME_FILTERS_KEY, values, values, 'Casting Time');
    }

    function getSelectedRitual() {
        const checkboxes = document.querySelectorAll('#ritual-filters input[type="checkbox"]');
        return Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
    }

    function getSelectedRange() {
        const checkboxes = document.querySelectorAll('#range-filters input[type="checkbox"]');
        return Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
    }

    function getSelectedCastingTime() {
        const checkboxes = document.querySelectorAll('#casting-time-filters input[type="checkbox"]');
        return Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    const VALYRIAN_KEY = 'espellbook_show_valyrian_names';

    function showValyrianNames() {
        try {
            return JSON.parse(localStorage.getItem(VALYRIAN_KEY)) === true;
        } catch {
            return false;
        }
    }

    function saveShowValyrianNames(value) {
        localStorage.setItem(VALYRIAN_KEY, JSON.stringify(value === true));
    }

    const SIGILS_IMMERSIVE_KEY = 'espellbook_show_sigils_immersive';
    const SIGILS_CAST_KEY = 'espellbook_show_sigils_cast';

    function showSigilsImmersive() {
        const raw = localStorage.getItem(SIGILS_IMMERSIVE_KEY);
        return raw === null ? true : JSON.parse(raw) === true;
    }

    function saveShowSigilsImmersive(value) {
        localStorage.setItem(SIGILS_IMMERSIVE_KEY, JSON.stringify(value === true));
    }

    function showSigilsCast() {
        const raw = localStorage.getItem(SIGILS_CAST_KEY);
        return raw === null ? true : JSON.parse(raw) === true;
    }

    function saveShowSigilsCast(value) {
        localStorage.setItem(SIGILS_CAST_KEY, JSON.stringify(value === true));
    }

    const BOKEH_CAST_KEY = 'espellbook_show_bokeh_cast';

    function showBokehCast() {
        const raw = localStorage.getItem(BOKEH_CAST_KEY);
        return raw === null ? true : JSON.parse(raw) === true;
    }

    function saveShowBokehCast(value) {
        localStorage.setItem(BOKEH_CAST_KEY, JSON.stringify(value === true));
    }

    // The flip-speed slider is a 1-100 "speed" dial, not a raw duration: higher
    // value = faster flip. FLIP_SPEED_MAX is a hard stop that disables the page
    // turn animation entirely (an explicit "off" position, not just a very fast
    // duration), letting users who don't want the animation turn it off.
    const FLIP_SPEED_MIN = 1;
    const FLIP_SPEED_MAX = 100;
    const DEFAULT_FLIP_SPEED = 75;
    const FLIP_DURATION_MIN_MS = 150;
    const FLIP_DURATION_MAX_MS = 2400;

    function getFlipSpeed() {
        const value = parseInt(localStorage.getItem('flipSpeed'), 10);
        if (!Number.isFinite(value)) return DEFAULT_FLIP_SPEED;
        return Math.min(FLIP_SPEED_MAX, Math.max(FLIP_SPEED_MIN, value));
    }

    // Returns the flip duration in ms, or 0 when the animation is disabled
    // (speed at its max value).
    function flipSpeedToDurationMs(speed) {
        if (speed >= FLIP_SPEED_MAX) return 0;
        const clamped = Math.max(FLIP_SPEED_MIN, Math.min(speed, FLIP_SPEED_MAX - 1));
        const t = (clamped - FLIP_SPEED_MIN) / (FLIP_SPEED_MAX - 1 - FLIP_SPEED_MIN);
        return Math.round(FLIP_DURATION_MAX_MS - t * (FLIP_DURATION_MAX_MS - FLIP_DURATION_MIN_MS));
    }

    function getFlipDurationMs() {
        return flipSpeedToDurationMs(getFlipSpeed());
    }

    function applyFlipSpeed(speed) {
        document.documentElement.style.setProperty('--flip-duration', `${flipSpeedToDurationMs(speed)}ms`);
    }

    function buildState() {
        const prefix = 'espellbook_';
        const state = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                try {
                    state[key] = JSON.parse(localStorage.getItem(key));
                } catch {
                    state[key] = localStorage.getItem(key);
                }
            }
        }
        ['theme', 'fontSize', 'flipSpeed'].forEach(key => {
            const value = localStorage.getItem(key);
            if (value !== null) state[key] = value;
        });
        return state;
    }

    function downloadState() {
        const state = buildState();
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${SHEET_CHARACTER.name || 'Spellbook'}_state.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    function restoreState(file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const state = JSON.parse(event.target.result);
                const prefix = 'espellbook_';
                for (let i = localStorage.length - 1; i >= 0; i--) {
                    const key = localStorage.key(i);
                    if (key && (key.startsWith(prefix) || ['theme', 'fontSize', 'flipSpeed'].includes(key))) {
                        localStorage.removeItem(key);
                    }
                }
                Object.entries(state).forEach(([key, value]) => {
                    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
                });
                window.location.reload();
            } catch (err) {
                alert('Invalid state file: ' + err.message);
            }
        };
        reader.readAsText(file);
    }

    function valyrianBlockHtml(spell) {
        if (!showValyrianNames() || !spell.valyrian || !spell.valyrian.name) return '';
        const interpretation = spell.valyrian.interpretation && spell.valyrian.interpretation !== '-'
            ? escapeHtml(spell.valyrian.interpretation)
            : '';
        const titleAttr = interpretation ? ` title="${interpretation}"` : '';
        return `<br><span class="valyrian-name"${titleAttr}>${escapeHtml(spell.valyrian.name)}</span>`;
    }

    function valyrianInlineHtml(spell) {
        if (!showValyrianNames() || !spell.valyrian || !spell.valyrian.name) return '';
        const interpretation = spell.valyrian.interpretation && spell.valyrian.interpretation !== '-'
            ? escapeHtml(spell.valyrian.interpretation)
            : '';
        const titleAttr = interpretation ? ` title="${interpretation}"` : '';
        return `<span class="valyrian-name"${titleAttr}>${escapeHtml(spell.valyrian.name)}</span>`;
    }

    function metaHtml(spell) {
        const items = [
            ['Casting Time', spell.casting_time],
            ['Range', spell.range],
            ['Components', spell.components],
            ['Duration', spell.duration],
        ];
        return '<dl class="spell-meta">' + items.map(([k, v]) =>
            v ? `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>` : ''
        ).join('') + '</dl>';
    }

    function sourcePageHtml(spell) {
        const source = spell.book_source || '';
        const page = spell.book_page || '';
        if (!source && !page) return '';
        return `<p class="spell-source">${escapeHtml(source)}-${escapeHtml(page)}</p>`;
    }

    function renderCatalog() {
        const list = document.getElementById('catalog-list');
        const search = document.getElementById('catalog-search');
        const filters = document.querySelectorAll('#source-filters, #book-source-filters');

        function renderCatalogCard(spell) {
            const spellbook = getSpellbook();
            const inBook = spellbook.includes(spell.id);
            return `
                <article class="spell-card" data-id="${spell.id}">
                    <div class="spell-header">
                        <h3 class="spell-name">${escapeHtml(spell.name)}</h3>
                        <p class="spell-level">${escapeHtml(formatLevelSchool(spell))}${valyrianBlockHtml(spell)}</p>
                    </div>
                    ${metaHtml(spell)}
                    <div class="spell-description">${spell.description}</div>
                    ${spell.classes && spell.classes.length ? `<p class="spell-classes">Classes: ${escapeHtml(spell.classes.join(', '))}</p>` : ''}
                    ${sourcePageHtml(spell)}
                    <div class="spell-actions">
                        <button class="btn btn-primary add-btn" data-id="${spell.id}" ${inBook ? 'disabled' : ''}>
                            ${inBook ? 'In SpellBook' : 'Add to SpellBook'}
                        </button>
                    </div>
                </article>`;
        }

        function draw(filter) {
            const term = (filter || '').toLowerCase();
            const selectedSources = getSelectedSources();
            const selectedBookSources = getSelectedBookSources();
            const selectedLevels = getSelectedLevels();
            const selectedSchools = getSelectedSchools();
            const selectedClasses = getSelectedClasses();
            const selectedRitual = getSelectedRitual();
            const selectedRange = getSelectedRange();
            const selectedCastingTime = getSelectedCastingTime();

            const filtered = SPELLS.filter(s => {
                const sourceOk = selectedSources.length === 0 || selectedSources.includes(s.source);
                const bookSourceOk = selectedBookSources.length === 0 || selectedBookSources.length === ALL_BOOK_SOURCES.length || selectedBookSources.includes(s.book_source);
                const levelOk = selectedLevels.length === 0 || selectedLevels.includes(getLevel(s));
                const schoolOk = selectedSchools.length === 0 || selectedSchools.includes(getSchool(s));
                const spellClasses = s.classes || [];
                const classOk = selectedClasses.length === 0 || selectedClasses.some(c => spellClasses.includes(c));
                const ritualCategory = s.ritual ? 'Ritual' : 'Non-ritual';
                const ritualOk = selectedRitual.length === 0 || selectedRitual.includes(ritualCategory);
                const rangeOk = selectedRange.length === 0 || selectedRange.includes(categorizeRange(s.range));
                const castingTimeOk = selectedCastingTime.length === 0 || selectedCastingTime.includes(categorizeCastingTime(s.casting_time));
                const termOk = term === '' || s.name.toLowerCase().includes(term) || s.school.toLowerCase().includes(term) || String(s.level).includes(term) || s.description.toLowerCase().includes(term);
                return sourceOk && bookSourceOk && levelOk && schoolOk && classOk && ritualOk && rangeOk && castingTimeOk && termOk;
            });

            if (!filtered.length) {
                list.innerHTML = '<p class="empty-state">No spells found.</p>';
                return;
            }

            const grouped = new Map();
            filtered.forEach(spell => {
                const level = getLevel(spell);
                if (!grouped.has(level)) grouped.set(level, []);
                grouped.get(level).push(spell);
            });
            const levels = Array.from(grouped.keys()).sort((a, b) => a - b);

            list.innerHTML = levels.map(level => `
                <div class="level-divider">${levelTitle(level)}</div>
                <div class="spell-grid">${grouped.get(level).map(renderCatalogCard).join('')}</div>
            `).join('');

            list.querySelectorAll('.add-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    addToSpellbook(btn.dataset.id);
                    draw(search.value);
                    renderSpellbook();
                });
            });

            list.querySelectorAll('.spell-card').forEach(card => {
                const id = card.dataset.id;
                const spell = findSpell(id);
                if (!spell) return;

                setupLongPress(card, () => {
                    openSigilPreview(spell);
                }, 1000);
            });
        }

        search.addEventListener('input', () => draw(search.value));
        filters.forEach(filter => {
            filter.addEventListener('change', () => draw(search.value));
        });
        draw();
    }

    function renderSpellbook() {
        const title = document.getElementById('spellbook-title');
        if (title) title.textContent = `${SHEET_CHARACTER.name || 'My'}'s Spellbook`;

        const list = document.getElementById('spellbook-list');
        const ids = getSpellbook();
        const spells = ids.map(findSpell).filter(Boolean);

        if (!spells.length) {
            list.innerHTML = '<p class="empty-state">Your SpellBook is empty. Add spells from the Spells Catalog.</p>';
            return;
        }

        const prepared = getPrepared();
        const grouped = new Map();
        spells.forEach(spell => {
            const level = getLevel(spell);
            if (!grouped.has(level)) grouped.set(level, []);
            grouped.get(level).push(spell);
        });
        grouped.forEach(group => group.sort((a, b) => {
            const aPrep = prepared.includes(a.id);
            const bPrep = prepared.includes(b.id);
            const aRitual = a.ritual && !aPrep;
            const bRitual = b.ritual && !bPrep;
            const aScore = aPrep ? 2 : (aRitual ? 1 : 0);
            const bScore = bPrep ? 2 : (bRitual ? 1 : 0);
            if (aScore !== bScore) return bScore - aScore;
            return a.name.localeCompare(b.name);
        }));
        const levels = Array.from(grouped.keys()).sort((a, b) => a - b);

        list.innerHTML = levels.map(level => {
            const levelSpells = grouped.get(level);
            const preparedCount = levelSpells.filter(s => prepared.includes(s.id)).length;
            const cap = level === 0 ? null : getPreparedCap(level);
            const header = level === 0
                ? `${levelTitle(level)}: ${preparedCount}`
                : (cap > 0 ? `${levelTitle(level)}: ${preparedCount}/${cap}` : `${levelTitle(level)}: ${preparedCount}`);
            return `
                <div class="level-divider">${header}</div>
                ${levelSpells.map(spell => renderSpellbookCard(spell, prepared.includes(spell.id))).join('')}`;
        }).join('');

        list.querySelectorAll('.collapse-btn').forEach(btn => {
            btn.addEventListener('click', () => toggleCard(btn.dataset.id));
        });

        list.querySelectorAll('.prepared-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                togglePrepared(btn.dataset.id);
                renderSpellbook();
                renderCatalog();
            });
        });

        list.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                removeFromSpellbook(btn.dataset.id);
                renderSpellbook();
                renderCatalog();
            });
        });

        list.querySelectorAll('.spellbook-card').forEach(card => {
            const id = card.dataset.id;
            const spell = findSpell(id);
            if (!spell) return;

            setupLongPress(card, () => {
                openCastModal(spell);
            }, 1000);
        });
    }

    function renderSpellbookCard(spell, isPrepared) {
        const ritualClass = isPrepared ? 'prepared' : (spell.ritual ? 'ritual-only' : '');
        return `
        <div class="spellbook-card collapsed" data-id="${spell.id}">
            <div class="spellbook-card-header">
                <button class="prepared-toggle ${ritualClass}" data-id="${spell.id}" title="Toggle prepared" aria-label="Toggle prepared"></button>
                <h3 class="spell-name">${escapeHtml(spell.name)}</h3>
                <button class="collapse-btn" data-id="${spell.id}" aria-label="Expand">+</button>
            </div>
            <div class="spellbook-card-body">
                <p class="spell-level">${escapeHtml(formatLevelSchool(spell))}${valyrianBlockHtml(spell)}</p>
                ${metaHtml(spell)}
                <div class="spell-description">${spell.description}</div>
                ${spell.classes && spell.classes.length ? `<p class="spell-classes">Classes: ${escapeHtml(spell.classes.join(', '))}</p>` : ''}
                ${sourcePageHtml(spell)}
                <div class="spell-actions">
                    <button class="btn btn-danger remove-btn" data-id="${spell.id}">Remove from SpellBook</button>
                </div>
            </div>
        </div>`;
    }

    function toggleCard(id) {
        const card = document.querySelector(`.spellbook-card[data-id="${CSS.escape(String(id))}"]`);
        if (!card) return;
        const body = card.querySelector('.spellbook-card-body');
        const btn = card.querySelector('.collapse-btn');
        const collapsed = card.classList.toggle('collapsed');
        btn.textContent = collapsed ? '+' : '−';
        btn.setAttribute('aria-label', collapsed ? 'Expand' : 'Collapse');
    }

    function spendSlotForSpell(level) {
        if (level <= 0) return false;
        const slots = getCurrentSlots();
        if (slots[level] > 0) {
            adjustSlot(level, -1);
            return true;
        }
        return false;
    }

    /* ---- Cast Modal ---- */
    let castAutoTimer = null;
    // Matches the .cast-modal opacity transition duration in style.css.
    const CAST_MODAL_FADE_MS = 500;

    function cancelCastCloseCleanup(modal) {
        if (modal._closeCleanupTimer) {
            clearTimeout(modal._closeCleanupTimer);
            modal._closeCleanupTimer = null;
        }
    }

    function openCastModal(spell) {
        const modal = document.getElementById('cast-modal');
        const nameEl = document.getElementById('cast-modal-name');
        const row = document.getElementById('cast-level-row');
        const confirmBtn = document.getElementById('cast-confirm-btn');
        const holdBtn = document.getElementById('cast-hold-btn');
        const sigilWrap = document.getElementById('cast-sigil-wrap');
        if (!modal || !nameEl || !row || !confirmBtn || !holdBtn || !sigilWrap) return;

        cancelCastCloseCleanup(modal);
        modal.classList.remove('casting');
        if (showSigilsCast()) {
            modal.classList.add('sigils-enabled');
        } else {
            modal.classList.remove('sigils-enabled');
        }
        sigilWrap.innerHTML = '';

        // Ambient bokeh starts right away, at a low spawn rate, so the modal
        // doesn't feel empty while the player is still picking a level;
        // doCast() bumps this up to full rate once they actually cast/hold.
        startCastBokeh(spell, BOKEH_AMBIENT_SPAWN_RATE);

        nameEl.textContent = spell.name;

        const spellLevel = getLevel(spell);
        const prepared = getPrepared();
        const isPrepared = prepared.includes(spell.id);
        const isRitual = !!spell.ritual;
        const maxSlots = getMaxSlotsArray();
        const currentSlots = getCurrentSlots();

        // Find the highest slot level the character has access to
        let maxAvailableLevel = 0;
        for (let i = 9; i >= 1; i--) {
            if (maxSlots[i] > 0) { maxAvailableLevel = i; break; }
        }

        // Build buttons: Ritual, 0, 1..9
        const buttons = [];
        // Ritual button
        buttons.push({ label: 'R', value: 'ritual', isRitual: true });
        // Level 0 (cantrip)
        buttons.push({ label: '0', value: 0 });
        // Levels 1-9
        for (let i = 1; i <= 9; i++) {
            buttons.push({ label: String(i), value: i });
        }

        // Determine default selection
        let defaultValue;
        if (spellLevel === 0) {
            defaultValue = 0;
        } else if (isRitual && !isPrepared) {
            defaultValue = 'ritual';
        } else {
            defaultValue = spellLevel;
        }

        let selectedValue = defaultValue;

        function renderButtons() {
            const curSlots = getCurrentSlots();
            row.innerHTML = '';
            buttons.forEach(b => {
                const div = document.createElement('div');
                div.className = 'cast-level-btn';
                div.textContent = b.label;
                div.dataset.value = b.value;

                let disabled = false;
                let spent = false;

                if (b.isRitual) {
                    // Ritual button: disabled if spell is not a ritual
                    if (!isRitual) disabled = true;
                } else if (b.value === 0) {
                    // Cantrip button: disabled if spell is not a cantrip
                    if (spellLevel !== 0) disabled = true;
                } else {
                    // Numeric level buttons
                    const lvl = b.value;
                    if (lvl < spellLevel) {
                        // Below spell's minimum level
                        disabled = true;
                    } else if (maxSlots[lvl] === 0) {
                        // Character has no slots at this level
                        disabled = true;
                    } else if (lvl > maxAvailableLevel) {
                        disabled = true;
                    } else if (curSlots[lvl] === 0) {
                        // Slots are spent
                        spent = true;
                    }
                }

                if (disabled) div.classList.add('disabled');
                if (spent) div.classList.add('spent');
                if (b.value === selectedValue || (b.value === 'ritual' && selectedValue === 'ritual')) {
                    div.classList.add('selected');
                }

                if (!disabled) {
                    div.addEventListener('click', () => {
                        selectedValue = b.value;
                        renderButtons();
                    });
                }

                row.appendChild(div);
            });
        }

        renderButtons();

        // Common cast logic: consume the slot and show the sigil.
        function doCast() {
            if (selectedValue === 'ritual' || selectedValue === 0) {
                // No slot consumed
            } else if (typeof selectedValue === 'number' && selectedValue >= 1) {
                spendSlotForSpell(selectedValue);
            }
            const castLevel = typeof selectedValue === 'number' ? selectedValue : spellLevel;
            if (showSigilsCast()) {
                sigilWrap.innerHTML = buildCastSigilSvg(spell, castLevel);
                applySigilMasks(sigilWrap);
                modal.classList.add('casting');
                if (FADE_IN_STYLE === 'one_by_one') modal.classList.add('fadein-one-by-one');
                startCastBokeh(spell, 1);
                return true;
            }
            return false;
        }

        // Replace confirm button listener (clone to remove old listeners)
        const newCastBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newCastBtn, confirmBtn);
        newCastBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (doCast()) {
                // Auto-cycle: wait 2s then start fade-out, close after fade-out
                castAutoTimer = setTimeout(() => {
                    castAutoTimer = null;
                    startCastFadeOut(modal, () => closeCastModal());
                }, 2000);
            } else {
                closeCastModal();
            }
        });

        // Replace hold button listener (clone to remove old listeners)
        const newHoldBtn = holdBtn.cloneNode(true);
        holdBtn.parentNode.replaceChild(newHoldBtn, holdBtn);
        newHoldBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!doCast()) {
                closeCastModal();
            }
            // Hold mode: sigil stays until user clicks the modal
        });

        // Close on background click while picking a level; once a sigil is
        // showing (post-cast), first click starts fade-out (unless auto-cycling),
        // second click during fade-out closes instantly.
        modal._bgClose = (e) => {
            if (modal.classList.contains('fading-out')) {
                closeCastModal();
            } else if (modal.classList.contains('casting')) {
                // If auto-cycling, cancel the auto timer and just close
                if (castAutoTimer) {
                    clearTimeout(castAutoTimer);
                    castAutoTimer = null;
                }
                startCastFadeOut(modal, () => closeCastModal());
            } else if (e.target === modal) {
                closeCastModal();
            }
        };
        modal.addEventListener('click', modal._bgClose);

        // Open with fade-in
        modal.classList.add('open');
    }

    function closeCastModal() {
        cancelCastFadeOut();
        if (castAutoTimer) {
            clearTimeout(castAutoTimer);
            castAutoTimer = null;
        }
        const modal = document.getElementById('cast-modal');
        if (!modal) return;
        sigilAnimationEntries = sigilAnimationEntries.filter(entry => {
            if (!modal.contains(entry.wrap)) return true;
            clearIdleSymbolPulse(entry);
            return false;
        });
        if (modal._bgClose) {
            modal.removeEventListener('click', modal._bgClose);
            modal._bgClose = null;
        }
        modal.classList.remove('open');
        // Defer clearing the casting/sigil state until the fade-out finishes,
        // otherwise the level picker and cast buttons (hidden by .casting)
        // flash back into view while the modal is still visible.
        cancelCastCloseCleanup(modal);
        modal._closeCleanupTimer = setTimeout(() => {
            modal._closeCleanupTimer = null;
            modal.classList.remove('casting');
            modal.classList.remove('fadein-one-by-one');
            modal.classList.remove('fading-out');
            modal.classList.remove('sigils-enabled');
            stopCastBokeh();
        }, CAST_MODAL_FADE_MS);
    }

    function openSigilPreview(spell) {
        const modal = document.getElementById('cast-modal');
        const nameEl = document.getElementById('cast-modal-name');
        const sigilWrap = document.getElementById('cast-sigil-wrap');
        if (!modal || !nameEl || !sigilWrap) return;

        cancelCastCloseCleanup(modal);
        nameEl.textContent = spell.name;
        sigilWrap.innerHTML = buildCastSigilSvg(spell, getLevel(spell));
        applySigilMasks(sigilWrap);
        modal.classList.add('casting');
        if (FADE_IN_STYLE === 'one_by_one') modal.classList.add('fadein-one-by-one');
        startCastBokeh(spell);
        modal.classList.add('open');

        if (modal._bgClose) {
            modal.removeEventListener('click', modal._bgClose);
            modal._bgClose = null;
        }
        modal._bgClose = (e) => {
            if (modal.classList.contains('fading-out')) {
                closeCastModal();
            } else if (modal.classList.contains('casting')) {
                startCastFadeOut(modal, () => closeCastModal());
            } else if (e.target === modal) {
                closeCastModal();
            }
        };
        modal.addEventListener('click', modal._bgClose);
    }

    /* ---- Cast Modal Bokeh ----
       An ambient particle field behind the sigil, rendered with plain WebGL1
       triangles (not gl_PointSize sprites, whose max size is unreliable
       across GPUs/drivers), reading as distant lights. Every particle's
       position/size/blur/color/opacity is derived purely from a per-particle
       seed plus the u_time uniform in the vertex shader, so nothing is
       simulated or re-uploaded from JS per frame - only u_time ticks. Each
       cycle (life + gap) reseeds the particle's spawn point/velocity/color
       pick via a hash of (seed, cycleIndex), which is how particles
       "respawn" randomly forever without any CPU-side bookkeeping. */
    // Ambient particles are present as soon as the modal opens (before the
    // player picks a level/casts), but spawn far less often; casting or
    // holding bumps the spawn rate up to 1.0 (see startCastBokeh's spawnRate).
    const BOKEH_AMBIENT_SPAWN_RATE = 0.2;

    const BOKEH_LAYERS = [
        // Behind the sigil, reading as distant lights. Blur is per-particle
        // rather than a uniform CSS filter: minEdgeSoftness (low = wide
        // feather = blurry) applies to the smallest particles,
        // maxEdgeSoftness (high = thin feather = crisp) to the biggest,
        // interpolated by each particle's own size.
        { canvasId: 'cast-bokeh-back', count: 16, minSize: 10, maxSize: 25, speed: 11.8, life: 3.0, minEdgeSoftness: 0.15, maxEdgeSoftness: 0.60 }
    ];

    const BOKEH_VERTEX_SHADER = `
        attribute float a_id;
        attribute vec2 a_corner;
        uniform float u_time;
        uniform vec2 u_resolution;
        uniform float u_minSize;
        uniform float u_maxSize;
        uniform float u_speed;
        uniform float u_baseLife;
        uniform float u_spawnRate;
        uniform float u_minEdgeSoftness;
        uniform float u_maxEdgeSoftness;
        uniform vec3 u_color1;
        uniform vec3 u_color2;
        uniform vec3 u_color3;
        varying vec2 v_uv;
        varying float v_alpha;
        varying vec3 v_color;
        varying float v_edgeSoftness;

        float hash(float n) { return fract(sin(n) * 43758.5453123); }
        float hash2(float n, float m) { return hash(n * 12.9898 + m * 78.233); }

        void main() {
            float seed = a_id + 1.0;
            float life = u_baseLife * (0.8 + 0.4 * hash2(seed, 10.0));
            float gap = u_baseLife * (0.6 + 1.2 * hash2(seed, 11.0));
            float cycle = life + gap;
            float phase = hash2(seed, 12.0) * cycle;
            float shifted = u_time + phase;
            float t = mod(shifted, cycle);
            float cycleIndex = floor(shifted / cycle);
            float alive = step(t, life);

            float basis = cycleIndex * 17.0;
            float rx = hash2(seed, basis + 1.0);
            float ry1 = hash2(seed, basis + 2.0);
            float ry2 = hash2(seed, basis + 3.0);
            float startX = rx * u_resolution.x;
            // Sum of two uniform draws biases y toward the horizontal
            // centerline instead of spreading evenly top-to-bottom.
            float startY = u_resolution.y * 0.5 + (ry1 + ry2 - 1.0) * u_resolution.y * 0.5;

            float vAngle = hash2(seed, basis + 4.0) * 6.28318530718;
            float vSpeed = u_speed * (0.3 + 0.7 * hash2(seed, basis + 5.0));
            vec2 vel = vec2(cos(vAngle), sin(vAngle)) * vSpeed;
            vec2 center = vec2(startX, startY) + vel * t;

            float fadeIn = 0.2;
            float fadeOut = 0.2;
            float envIn = clamp(t / fadeIn, 0.0, 1.0);
            float envOut = clamp((life - t) / fadeOut, 0.0, 1.0);
            float env = min(envIn, envOut);
            float flickerSeed = hash2(seed, basis + 6.0);
            float flicker = 0.82 + 0.18 * sin(t * 9.0 + flickerSeed * 6.28318530718);

            // Each cycle independently rolls whether this particle actually
            // spawns at all, so u_spawnRate directly controls how often
            // particles appear (1.0 = every cycle, 0.2 = roughly 1 in 5).
            float spawnRoll = hash2(seed, basis + 15.0);
            float spawnGate = step(spawnRoll, u_spawnRate);

            v_alpha = alive * env * flicker * spawnGate;

            float colorPick = hash2(seed, basis + 7.0);
            vec3 baseColor = colorPick < 0.3333 ? u_color1 : (colorPick < 0.6667 ? u_color2 : u_color3);
            vec3 jitter = vec3(
                hash2(seed, basis + 8.0),
                hash2(seed, basis + 9.0),
                hash2(seed, basis + 13.0)
            );
            v_color = clamp(baseColor * (1.0 + (jitter - 0.5) * 0.4), 0.0, 1.0);

            // Same 0-1 factor drives both size and blur, so smaller
            // particles (low sizeFactor) get a wider soft feather
            // (blurrier) and bigger ones get a thin, near-crisp edge.
            float sizeFactor = hash2(seed, basis + 14.0);
            float size = mix(u_minSize, u_maxSize, sizeFactor);
            v_edgeSoftness = mix(u_minEdgeSoftness, u_maxEdgeSoftness, sizeFactor);
            vec2 pixelPos = center + a_corner * size * 0.5;
            vec2 clip = (pixelPos / u_resolution) * 2.0 - 1.0;
            clip.y = -clip.y;
            v_uv = a_corner;
            gl_Position = vec4(clip, 0.0, 1.0);
        }
    `;

    const BOKEH_FRAGMENT_SHADER = `
        precision mediump float;
        varying vec2 v_uv;
        varying float v_alpha;
        varying vec3 v_color;
        varying float v_edgeSoftness;
        void main() {
            float dist = length(v_uv);
            float mask = 1.0 - smoothstep(v_edgeSoftness, 1.0, dist);
            float alpha = v_alpha * mask;
            if (alpha <= 0.001) discard;
            gl_FragColor = vec4(v_color * alpha, alpha);
        }
    `;

    let bokehStates = null;
    let bokehActive = false;
    let bokehAnimationId = null;
    let bokehStartTime = 0;

    function compileBokehProgram(gl) {
        function compileShader(type, source) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                const message = gl.getShaderInfoLog(shader);
                gl.deleteShader(shader);
                throw new Error(message);
            }
            return shader;
        }
        const vs = compileShader(gl.VERTEX_SHADER, BOKEH_VERTEX_SHADER);
        const fs = compileShader(gl.FRAGMENT_SHADER, BOKEH_FRAGMENT_SHADER);
        const program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const message = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);
            throw new Error(message);
        }
        return program;
    }

    function initBokehLayer(layer) {
        const canvas = document.getElementById(layer.canvasId);
        if (!canvas) return null;
        const gl = canvas.getContext('webgl', {
            alpha: true,
            antialias: false,
            depth: false,
            stencil: false,
            premultipliedAlpha: true,
            powerPreference: 'low-power'
        }) || canvas.getContext('experimental-webgl');
        if (!gl) return null;

        let program;
        try {
            program = compileBokehProgram(gl);
        } catch (error) {
            console.error('Bokeh WebGL init failed:', error);
            return null;
        }
        gl.useProgram(program);

        // 6 vertices (2 triangles) per particle: (id, cornerX, cornerY).
        const corners = [[-1, -1], [1, -1], [-1, 1], [-1, 1], [1, -1], [1, 1]];
        const vertexData = new Float32Array(layer.count * 6 * 3);
        for (let i = 0; i < layer.count; i++) {
            for (let c = 0; c < 6; c++) {
                const base = (i * 6 + c) * 3;
                vertexData[base] = i;
                vertexData[base + 1] = corners[c][0];
                vertexData[base + 2] = corners[c][1];
            }
        }
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);

        const aId = gl.getAttribLocation(program, 'a_id');
        const aCorner = gl.getAttribLocation(program, 'a_corner');

        const uniforms = {};
        ['u_time', 'u_resolution', 'u_minSize', 'u_maxSize', 'u_speed', 'u_baseLife', 'u_spawnRate', 'u_minEdgeSoftness', 'u_maxEdgeSoftness', 'u_color1', 'u_color2', 'u_color3']
            .forEach(name => { uniforms[name] = gl.getUniformLocation(program, name); });

        return { canvas, gl, program, buffer, aId, aCorner, uniforms, layer, colors: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], spawnRate: 1, spawnRateTarget: 1, dpr: 1 };
    }

    function resizeBokehCanvas(state) {
        const canvas = state.canvas;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
        const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }
        state.dpr = dpr;
    }

    function drawBokehLayer(state, timeSec) {
        resizeBokehCanvas(state);
        const gl = state.gl;
        gl.viewport(0, 0, state.canvas.width, state.canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(state.program);

        gl.uniform1f(state.uniforms.u_time, timeSec);
        gl.uniform2f(state.uniforms.u_resolution, state.canvas.width, state.canvas.height);
        gl.uniform1f(state.uniforms.u_minSize, state.layer.minSize * state.dpr);
        gl.uniform1f(state.uniforms.u_maxSize, state.layer.maxSize * state.dpr);
        gl.uniform1f(state.uniforms.u_speed, state.layer.speed * state.dpr);
        gl.uniform1f(state.uniforms.u_baseLife, state.layer.life);
        gl.uniform1f(state.uniforms.u_spawnRate, state.spawnRate);
        gl.uniform1f(state.uniforms.u_minEdgeSoftness, state.layer.minEdgeSoftness);
        gl.uniform1f(state.uniforms.u_maxEdgeSoftness, state.layer.maxEdgeSoftness);
        gl.uniform3f(state.uniforms.u_color1, state.colors[0][0], state.colors[0][1], state.colors[0][2]);
        gl.uniform3f(state.uniforms.u_color2, state.colors[1][0], state.colors[1][1], state.colors[1][2]);
        gl.uniform3f(state.uniforms.u_color3, state.colors[2][0], state.colors[2][1], state.colors[2][2]);

        gl.bindBuffer(gl.ARRAY_BUFFER, state.buffer);
        gl.enableVertexAttribArray(state.aId);
        gl.vertexAttribPointer(state.aId, 1, gl.FLOAT, false, 12, 0);
        gl.enableVertexAttribArray(state.aCorner);
        gl.vertexAttribPointer(state.aCorner, 2, gl.FLOAT, false, 12, 4);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.drawArrays(gl.TRIANGLES, 0, state.layer.count * 6);
    }

    // Time constant (seconds) for spawnRate to ease toward its target -
    // without this, bumping the uniform straight from ambient to full rate
    // makes every particle whose per-cycle roll falls in between pop in on
    // the same frame, since the shader re-evaluates the gate every frame
    // with no memory of a ramp. Exponential easing here gives a smooth rise
    // instead (~63% of the way there after one tau, ~95% after three).
    const BOKEH_SPAWN_RATE_TAU = 1.2;
    let bokehLastFrameTime = 0;

    function bokehAnimationLoop(timestamp) {
        if (!bokehActive || !bokehStates) {
            bokehAnimationId = null;
            return;
        }
        const dt = Math.max(0, (timestamp - bokehLastFrameTime) * 0.001);
        bokehLastFrameTime = timestamp;
        const ease = 1 - Math.exp(-dt / BOKEH_SPAWN_RATE_TAU);
        const timeSec = (timestamp - bokehStartTime) * 0.001;
        for (const state of bokehStates) {
            state.spawnRate += (state.spawnRateTarget - state.spawnRate) * ease;
            drawBokehLayer(state, timeSec);
        }
        bokehAnimationId = requestAnimationFrame(bokehAnimationLoop);
    }

    // Parses a spell's three sigil colors into 0-1 RGB triples for the shader.
    function spellBokehColors(spell) {
        const style = (spell.sigil_params && spell.sigil_params.style) || {};
        const toFloat3 = (rgbString) => rgbComponents(rgbString).split(',').map(v => parseFloat(v) / 255);
        return [toFloat3(style.color_1), toFloat3(style.color_2), toFloat3(style.color_3)];
    }

    // spawnRate defaults to full density (1.0); pass BOKEH_AMBIENT_SPAWN_RATE
    // while the player is still picking a level, before they've cast/held.
    // Calling this again on an already-running field (e.g. ambient -> full
    // rate once cast/hold is clicked) only retargets spawnRate, which then
    // eases toward it in bokehAnimationLoop rather than jumping instantly -
    // and it deliberately does not reset bokehStartTime, so particles
    // already mid-lifecycle don't jump either.
    function startCastBokeh(spell, spawnRate) {
        if (!showBokehCast()) return;
        if (!bokehStates) {
            bokehStates = BOKEH_LAYERS.map(initBokehLayer).filter(Boolean);
        }
        if (!bokehStates.length) return;
        const colors = spellBokehColors(spell);
        const rate = spawnRate === undefined ? 1 : spawnRate;
        const isFreshStart = bokehAnimationId === null;
        bokehStates.forEach(state => {
            state.colors = colors;
            state.spawnRateTarget = rate;
            if (isFreshStart) state.spawnRate = rate;
        });
        bokehActive = true;
        if (isFreshStart) {
            bokehStartTime = performance.now();
            bokehLastFrameTime = bokehStartTime;
            bokehAnimationId = requestAnimationFrame(bokehAnimationLoop);
        }
    }

    function stopCastBokeh() {
        bokehActive = false;
        if (bokehAnimationId !== null) {
            cancelAnimationFrame(bokehAnimationId);
            bokehAnimationId = null;
        }
    }

    function setupLongPress(element, callback, duration = 3000) {
        let timer = null;
        let startX = 0;
        let startY = 0;

        function isInteractive(target) {
            return target.closest('button, .collapse-btn, .prepared-toggle, .remove-btn, .spell-actions') !== null;
        }

        function start(e) {
            if (e.type === 'mousedown' && e.button !== 0) return;
            if (isInteractive(e.target)) return;
            if (e.type === 'touchstart') {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            }
            element.classList.add('long-press-active');
            timer = setTimeout(() => {
                timer = null;
                element.classList.remove('long-press-active');
                callback();
            }, duration);
        }

        function cancel() {
            if (timer) {
                clearTimeout(timer);
                timer = null;
                element.classList.remove('long-press-active');
            }
        }

        function move(e) {
            if (timer && e.type === 'touchmove') {
                const dx = Math.abs(e.touches[0].clientX - startX);
                const dy = Math.abs(e.touches[0].clientY - startY);
                if (dx > 10 || dy > 10) cancel();
            }
        }

        element.addEventListener('mousedown', start);
        element.addEventListener('mouseup', cancel);
        element.addEventListener('mouseleave', cancel);
        element.addEventListener('touchstart', start, { passive: true });
        element.addEventListener('touchend', cancel);
        element.addEventListener('touchmove', move, { passive: true });
        element.addEventListener('contextmenu', e => e.preventDefault());
    }

    function addToSpellbook(id) {
        id = Number(id);
        const list = getSpellbook();
        if (!list.includes(id)) {
            list.push(id);
            saveSpellbook(list);
        }
    }

    function removeFromSpellbook(id) {
        id = Number(id);
        const list = getSpellbook().filter(spellId => spellId !== id);
        saveSpellbook(list);
        savePrepared(getPrepared().filter(spellId => spellId !== id));
    }

    function setupOptions() {
        const theme = document.getElementById('theme-select');
        const fontSize = document.getElementById('font-size');
        const valyrianToggle = document.getElementById('valyrian-toggle');
        const flipSpeed = document.getElementById('flip-speed');
        const saveStateBtn = document.getElementById('save-state');
        const loadStateBtn = document.getElementById('load-state');
        const loadStateInput = document.getElementById('load-state-input');
        const sigilsImmersiveToggle = document.getElementById('sigils-immersive-toggle');
        const sigilsCastToggle = document.getElementById('sigils-cast-toggle');
        const bokehCastToggle = document.getElementById('bokeh-cast-toggle');

        const savedTheme = localStorage.getItem('theme') || 'dark';
        theme.value = savedTheme;
        document.body.classList.add('theme-' + savedTheme);

        if (valyrianToggle) {
            valyrianToggle.checked = showValyrianNames();
            valyrianToggle.addEventListener('change', () => {
                saveShowValyrianNames(valyrianToggle.checked);
                renderCatalog();
                renderSpellbook();
            });
        }

        if (sigilsImmersiveToggle) {
            sigilsImmersiveToggle.checked = showSigilsImmersive();
            sigilsImmersiveToggle.addEventListener('change', () => {
                saveShowSigilsImmersive(sigilsImmersiveToggle.checked);
                renderImmersiveBook();
            });
        }

        if (sigilsCastToggle) {
            sigilsCastToggle.checked = showSigilsCast();
            sigilsCastToggle.addEventListener('change', () => {
                saveShowSigilsCast(sigilsCastToggle.checked);
            });
        }

        if (bokehCastToggle) {
            bokehCastToggle.checked = showBokehCast();
            bokehCastToggle.addEventListener('change', () => {
                saveShowBokehCast(bokehCastToggle.checked);
                if (!bokehCastToggle.checked) stopCastBokeh();
            });
        }

        theme.addEventListener('change', () => {
            document.body.classList.remove('theme-dark', 'theme-light', 'theme-parchment');
            document.body.classList.add('theme-' + theme.value);
            localStorage.setItem('theme', theme.value);
        });

        const savedSize = localStorage.getItem('fontSize') || '16';
        fontSize.value = savedSize;
        document.documentElement.style.fontSize = savedSize + 'px';

        fontSize.addEventListener('input', () => {
            document.documentElement.style.fontSize = fontSize.value + 'px';
            localStorage.setItem('fontSize', fontSize.value);
        });

        applyFlipSpeed(getFlipSpeed());
        if (flipSpeed) {
            flipSpeed.value = getFlipSpeed();
            flipSpeed.addEventListener('input', () => {
                const speed = parseInt(flipSpeed.value, 10);
                localStorage.setItem('flipSpeed', speed);
                applyFlipSpeed(speed);
            });
        }

        if (saveStateBtn) {
            saveStateBtn.addEventListener('click', downloadState);
        }

        if (loadStateBtn && loadStateInput) {
            loadStateBtn.addEventListener('click', () => loadStateInput.click());
            loadStateInput.addEventListener('change', () => {
                if (loadStateInput.files && loadStateInput.files[0]) {
                    restoreState(loadStateInput.files[0]);
                }
            });
        }
    }

    const HP_KEY = 'espellbook_hp';
    const TEMP_HP_KEY = 'espellbook_temp_hp';
    const SLOTS_KEY = 'espellbook_slots';

    function getCharacterLevel() {
        const classes = SHEET_CHARACTER.classes || {};
        return Object.values(classes).reduce((sum, lvl) => sum + (parseInt(lvl) || 0), 0);
    }

    function getAbilityModifier(score) {
        if (RULES.ability_modifiers && RULES.ability_modifiers.by_score) {
            return RULES.ability_modifiers.by_score[String(score)] || 0;
        }
        return Math.floor((score - 10) / 2);
    }

    function getProficiencyBonus(level) {
        if (RULES.proficiency && RULES.proficiency.by_level) {
            return RULES.proficiency.by_level[String(level)] || Math.ceil(level / 4) + 1;
        }
        return Math.ceil(level / 4) + 1;
    }

    function getPrimaryClass() {
        const classNames = Object.keys(SHEET_CHARACTER.classes || {});
        if (!classNames.length) return null;
        return CLASSES[classNames[0].toLowerCase()] || null;
    }

    function getCastingStatName() {
        const cls = getPrimaryClass();
        return cls ? cls.casting_stat : null;
    }

    function getMagicType() {
        const classes = SHEET_CHARACTER.classes || {};
        let topClass = '';
        let topLevel = 0;
        for (const [name, lvl] of Object.entries(classes)) {
            if (lvl > topLevel) {
                topLevel = lvl;
                topClass = name.toLowerCase();
            }
        }

        const arcane = ['wizard', 'sorcerer', 'bard', 'artificer'];
        const holy = ['cleric', 'paladin'];
        const nature = ['druid', 'ranger'];

        if (arcane.includes(topClass)) return 'arcane';
        if (holy.includes(topClass)) return 'holy';
        if (nature.includes(topClass)) return 'nature';
        if (topClass === 'warlock') return 'warlock';
        return 'arcane';
    }

    function getCastingModifier() {
        const stat = getCastingStatName();
        if (!stat) return 0;
        const score = (SHEET_CHARACTER.attributes || {})[stat] || 10;
        return getAbilityModifier(score);
    }

    function getSpellDc() {
        const level = getCharacterLevel();
        const prof = getProficiencyBonus(level);
        const mod = getCastingModifier();
        const override = (SHEET_CHARACTER.custom_mods && SHEET_CHARACTER.custom_mods.spell_dc_mod) || 0;
        return 8 + prof + mod + override;
    }

    function getSpellAttack() {
        const level = getCharacterLevel();
        const prof = getProficiencyBonus(level);
        const mod = getCastingModifier();
        const override = (SHEET_CHARACTER.custom_mods && SHEET_CHARACTER.custom_mods.spell_attack_mod) || 0;
        return prof + mod + override;
    }

    const ABILITY_ABBREV = {
        strength: 'Str', dexterity: 'Dex', constitution: 'Con',
        intelligence: 'Int', wisdom: 'Wis', charisma: 'Cha'
    };

    function getSkillList() {
        const bySkill = (RULES.skills && RULES.skills.by_skill) || {};
        return Object.keys(bySkill).sort((a, b) => a.localeCompare(b)).map(name => ({ name, ability: bySkill[name] }));
    }

    // Ranks the character's six ability modifiers into tiers so skills can be
    // color-grouped by how strong the character is in the governing ability.
    // Ties share a tier; a stat only falls to "red" if it isn't already the
    // highest or second-highest tier.
    function getAbilityTierMap() {
        const attrs = SHEET_CHARACTER.attributes || {};
        const mods = {};
        Object.keys(attrs).forEach(key => { mods[key] = getAbilityModifier(attrs[key]); });

        const distinctDesc = [...new Set(Object.values(mods))].sort((a, b) => b - a);
        const highest = distinctDesc[0];
        const second = distinctDesc.length > 1 ? distinctDesc[1] : null;

        const tiers = {};
        Object.entries(mods).forEach(([key, mod]) => {
            if (mod === highest) tiers[key] = 'green';
            else if (second !== null && mod === second) tiers[key] = 'blue';
            else if (mod < 0) tiers[key] = 'red';
            else tiers[key] = 'neutral';
        });
        return tiers;
    }

    function isSkillProficient(skillName) {
        return (SHEET_CHARACTER.skill_proficiencies || []).includes(skillName);
    }

    function getSkillCustomMod(skillName) {
        const skillMods = (SHEET_CHARACTER.custom_mods && SHEET_CHARACTER.custom_mods.skills) || {};
        return parseInt(skillMods[skillName]) || 0;
    }

    function getSkillModifier(skillName, ability) {
        const level = getCharacterLevel();
        const prof = getProficiencyBonus(level);
        const abilityMod = getAbilityModifier((SHEET_CHARACTER.attributes || {})[ability] || 10);
        const profBonus = isSkillProficient(skillName) ? prof : 0;
        return abilityMod + profBonus + getSkillCustomMod(skillName);
    }

    function getMaxSlotsArray() {
        const slots = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        const customMods = (SHEET_CHARACTER.custom_mods && SHEET_CHARACTER.custom_mods.slots) || {};

        const cls = getPrimaryClass();
        const level = getCharacterLevel();
        const progression = cls && cls.progression ? cls.progression[String(level)] : null;
        if (progression) {
            if (cls.spellcasting === 'pact') {
                const pactLevel = progression.pact_slot_level || 0;
                const pactSlots = progression.pact_slots || 0;
                if (pactLevel >= 1 && pactLevel <= 9) {
                    slots[pactLevel] = pactSlots;
                }
            } else {
                const classSlots = progression.spell_slots || [];
                for (let i = 0; i < classSlots.length && i < 9; i++) {
                    slots[i + 1] = classSlots[i] || 0;
                }
            }
        }

        for (let i = 0; i <= 9; i++) {
            const mod = parseInt(customMods[String(i)]) || 0;
            slots[i] = Math.max(0, slots[i] + mod);
        }
        return slots;
    }

    function getCurrentSlots() {
        try {
            const saved = JSON.parse(localStorage.getItem(SLOTS_KEY));
            if (saved && Array.isArray(saved) && saved.length === 10) return saved;
        } catch {}
        return getMaxSlotsArray();
    }

    function saveSlots(slots) {
        localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
    }

    function getHp(key, defaultValue) {
        try {
            const val = parseInt(localStorage.getItem(key));
            if (!isNaN(val)) return val;
        } catch {}
        return defaultValue;
    }

    function getMaxHp() {
        return (SHEET_CHARACTER.stats && SHEET_CHARACTER.stats.hp) || 1;
    }

    function getCurrentHp() {
        return getHp(HP_KEY, getMaxHp());
    }

    function getTempHp() {
        return getHp(TEMP_HP_KEY, 0);
    }

    function saveHp(value) {
        localStorage.setItem(HP_KEY, String(value));
    }

    function saveTempHp(value) {
        localStorage.setItem(TEMP_HP_KEY, String(value));
    }

    function adjustHp(delta) {
        let current = getCurrentHp();
        let temp = getTempHp();

        if (delta < 0) {
            const damage = Math.abs(delta);
            if (temp > 0) {
                if (temp >= damage) {
                    temp -= damage;
                    delta = 0;
                } else {
                    delta = -(damage - temp);
                    temp = 0;
                }
            }
            current = Math.max(0, current + delta);
        } else {
            current = Math.min(getMaxHp(), current + delta);
        }

        saveHp(current);
        saveTempHp(temp);
        renderCharSheet();
    }

    function adjustTempHp(delta) {
        let temp = getTempHp();
        temp = Math.max(0, temp + delta);
        saveTempHp(temp);
        renderCharSheet();
    }

    function adjustSlot(level, delta) {
        const slots = getCurrentSlots();
        slots[level] = Math.max(0, slots[level] + delta);
        saveSlots(slots);
        renderCharSheet();
    }

    function resetSlots() {
        saveSlots(getMaxSlotsArray());
        renderCharSheet();
    }

    function formatModifier(mod) {
        return mod >= 0 ? `+${mod}` : `${mod}`;
    }

    function renderCharSheet() {
        const container = document.getElementById('char-sheet');
        if (!container) return;

        const level = getCharacterLevel();
        const prof = getProficiencyBonus(level);
        const castingStat = getCastingStatName();
        const spellDc = getSpellDc();
        const spellAttack = getSpellAttack();
        const maxHp = getMaxHp();
        const currentHp = getCurrentHp();
        const tempHp = getTempHp();
        const maxSlots = getMaxSlotsArray();
        const currentSlots = getCurrentSlots();

        const attrs = SHEET_CHARACTER.attributes || {};
        const attrItems = Object.entries(attrs).map(([key, score]) => {
            const mod = getAbilityModifier(score);
            const fullLabel = key.charAt(0).toUpperCase() + key.slice(1);
            const isCastingAttr = castingStat && key === castingStat;
            return `<div class="attr-box ${isCastingAttr ? 'casting-attr' : ''}">
                <span class="attr-label">${escapeHtml(fullLabel)}</span>
                <span class="attr-mod">${formatModifier(mod)}</span>
                <span class="attr-score">${score}</span>
            </div>`;
        }).join('');

        const slotLevels = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(l => maxSlots[l] > 0);
        const slotsHtml = slotLevels.length ? slotLevels.map(level => {
            const current = currentSlots[level];
            const max = maxSlots[level];
            const orbs = Array.from({ length: max }, (_, i) => {
                const filled = i < current;
                return `<span class="slot-orb ${filled ? 'filled' : 'spent'}" style="animation-delay: ${i * 0.35}s" aria-label="${filled ? 'Available slot' : 'Spent slot'}"></span>`;
            }).join('');
            return `
                <div class="slot-level-group" data-level="${level}">
                    <span class="slot-level-label">Level ${level}</span>
                    <div class="slot-orbs">${orbs}</div>
                </div>
            `;
        }).join('') : '<p class="empty-state">No spell slots available at this level.</p>';

        const abilityTiers = getAbilityTierMap();
        const skillsHtml = getSkillList().map(({ name, ability }) => {
            const tier = abilityTiers[ability] || 'neutral';
            const proficient = isSkillProficient(name);
            const mod = getSkillModifier(name, ability);
            return `
                <div class="skill-row tier-${tier}">
                    <span class="skill-prof-dot ${proficient ? 'is-proficient' : ''}" aria-label="${proficient ? 'Proficient' : 'Not proficient'}"></span>
                    <span class="skill-name">${escapeHtml(name)}</span>
                    <span class="skill-ability">${ABILITY_ABBREV[ability] || ''}</span>
                    <span class="skill-mod">${formatModifier(mod)}</span>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="char-header">
                <h2>${escapeHtml(SHEET_CHARACTER.name || 'Character')}</h2>
                <p>Level ${level} • Proficiency ${formatModifier(prof)}</p>
            </div>

            <div class="char-combat">
                <div class="combat-box">
                    <span class="combat-label">Spell Save DC</span>
                    <span class="combat-value">${spellDc}</span>
                </div>
                <div class="combat-box">
                    <span class="combat-label">Spell Attack</span>
                    <span class="combat-value">${formatModifier(spellAttack)}</span>
                </div>
                <div class="combat-box hp-card" data-hp-type="hp">
                    <span class="combat-label">HP</span>
                    <span class="combat-value">${currentHp}/${maxHp}</span>
                </div>
                <div class="combat-box hp-card" data-hp-type="temp">
                    <span class="combat-label">Temp HP</span>
                    <span class="combat-value">${tempHp}</span>
                </div>
            </div>

            <div class="char-attrs">
                ${attrItems}
            </div>

            <div class="slots-section">
                <div class="slots-header">
                    <h3>Spell Slots</h3>
                    <button id="reset-slots" class="btn btn-primary">Reset</button>
                </div>
                <div class="slots-grid ${getMagicType()}">
                    ${slotsHtml}
                </div>
            </div>

            <div class="skills-section">
                <h3>Skills</h3>
                <div class="skills-grid">
                    ${skillsHtml}
                </div>
            </div>
        `;

        container.querySelectorAll('.hp-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const rect = card.getBoundingClientRect();
                const type = card.dataset.hpType;
                const delta = (e.clientX - rect.left) > (rect.width / 2) ? 1 : -1;
                if (type === 'hp') adjustHp(delta);
                else adjustTempHp(delta);
            });
        });

        container.querySelectorAll('.slot-level-group').forEach(group => {
            group.addEventListener('click', () => {
                const level = parseInt(group.dataset.level);
                const current = getCurrentSlots()[level];
                if (current > 0) adjustSlot(level, -1);
            });
            setupLongPress(group, () => {
                const level = parseInt(group.dataset.level);
                const current = getCurrentSlots()[level];
                const max = getMaxSlotsArray()[level];
                if (current < max) adjustSlot(level, 1);
            }, 1000);
        });

        const resetBtn = document.getElementById('reset-slots');
        if (resetBtn) resetBtn.addEventListener('click', resetSlots);
    }

    function renderSheetEditor() {
        const container = document.getElementById('char-sheet-editor');
        if (!container) return;

        const classes = SHEET_CHARACTER.classes || {};
        const attributes = SHEET_CHARACTER.attributes || {};
        const stats = SHEET_CHARACTER.stats || {};
        const override = SHEET_CHARACTER.custom_mods || {};
        const slots = override.slots || {};
        const prepared = override.prepared || {};
        const skillMods = override.skills || {};
        const skillProficiencies = SHEET_CHARACTER.skill_proficiencies || [];

        const classInputs = Object.keys(CLASSES).map(key => {
            const cls = CLASSES[key];
            const value = classes[key] || 0;
            return `<label class="sheet-field">
                <span>${escapeHtml(cls.name)} Level</span>
                <input type="number" class="sheet-class-level" data-class="${escapeHtml(key)}" value="${value}" min="0" max="20">
            </label>`;
        }).join('');

        const attrInputs = Object.keys(attributes).map(key => {
            const score = attributes[key] || 10;
            return `<label class="sheet-field">
                <span>${escapeHtml(key.charAt(0).toUpperCase() + key.slice(1))}</span>
                <input type="number" class="sheet-attr" data-attr="${escapeHtml(key)}" value="${score}" min="1" max="30">
            </label>`;
        }).join('');

        const slotInputs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => `
            <label class="sheet-field small">
                <span>Lvl ${level}</span>
                <input type="number" class="sheet-slot-override" data-level="${level}" value="${slots[String(level)] || 0}" min="0">
            </label>
        `).join('');

        const preparedInputs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => `
            <label class="sheet-field small">
                <span>Lvl ${level}</span>
                <input type="number" class="sheet-prepared-override" data-level="${level}" value="${prepared[String(level)] || 0}" min="0">
            </label>
        `).join('');

        const skillList = getSkillList();

        const skillProfInputs = skillList.map(({ name, ability }) => `
            <label class="filter-toggle">
                <input type="checkbox" class="sheet-skill-prof" data-skill="${escapeHtml(name)}" ${skillProficiencies.includes(name) ? 'checked' : ''}>
                ${escapeHtml(name)} <span class="skill-ability">(${ABILITY_ABBREV[ability] || ''})</span>
            </label>
        `).join('');

        const skillModInputs = skillList.map(({ name }) => `
            <label class="sheet-field small">
                <span>${escapeHtml(name)}</span>
                <input type="number" class="sheet-skill-mod" data-skill="${escapeHtml(name)}" value="${skillMods[name] || 0}">
            </label>
        `).join('');

        container.innerHTML = `
            <div class="sheet-header">
                <h2>Character Sheet</h2>
                <p>Edit values here; changes are saved locally in the browser.</p>
            </div>
            <div class="sheet-form">
                <div class="sheet-section">
                    <h3>Basic</h3>
                    <label class="sheet-field">
                        <span>Name</span>
                        <input type="text" id="sheet-name" value="${escapeHtml(SHEET_CHARACTER.name || '')}">
                    </label>
                    <label class="sheet-field">
                        <span>Max HP</span>
                        <input type="number" id="sheet-hp" value="${stats.hp || 1}" min="1">
                    </label>
                </div>

                <div class="sheet-section">
                    <h3>Classes</h3>
                    <div class="sheet-grid">
                        ${classInputs}
                    </div>
                </div>

                <div class="sheet-section">
                    <h3>Attributes</h3>
                    <div class="sheet-grid">
                        ${attrInputs}
                    </div>
                </div>

                <div class="sheet-section">
                    <h3>Skill Proficiencies</h3>
                    <p class="sheet-hint">Which skills your character is trained in. Drives the proficiency dot and modifier shown on the Stats tab.</p>
                    <div class="filter-row">
                        ${skillProfInputs}
                    </div>
                </div>

                <div class="sheet-section">
                    <h3>Custom Mods: Skill Bonuses</h3>
                    <p class="sheet-hint">Added on top of the automatically calculated skill modifier (ability + proficiency).</p>
                    <div class="sheet-grid small">
                        ${skillModInputs}
                    </div>
                </div>

                <div class="sheet-section">
                    <h3>Custom Mods: Spell DC &amp; Attack</h3>
                    <p class="sheet-hint">Overrides on top of the automatically calculated values — use for magic items, boons, or other one-off bonuses.</p>
                    <div class="sheet-grid">
                        <label class="sheet-field">
                            <span>Spell DC Mod</span>
                            <input type="number" id="sheet-dc-mod" value="${override.spell_dc_mod || 0}">
                        </label>
                        <label class="sheet-field">
                            <span>Spell Attack Mod</span>
                            <input type="number" id="sheet-attack-mod" value="${override.spell_attack_mod || 0}">
                        </label>
                    </div>
                </div>

                <div class="sheet-section">
                    <h3>Custom Mods: Spell Slots (per level)</h3>
                    <p class="sheet-hint">Added on top of the slots calculated from your class &amp; level.</p>
                    <div class="sheet-grid small">
                        ${slotInputs}
                    </div>
                </div>

                <div class="sheet-section">
                    <h3>Custom Mods: Prepared Spells (per level)</h3>
                    <p class="sheet-hint">Added on top of the prepared-spell count calculated from your class &amp; level.</p>
                    <div class="sheet-grid small">
                        ${preparedInputs}
                    </div>
                </div>

                <div class="sheet-actions">
                    <button id="save-sheet" class="btn btn-primary">Save Changes</button>
                    <button id="reset-sheet" class="btn btn-danger">Reset to Generated</button>
                </div>
            </div>
        `;

        container.querySelector('#save-sheet').addEventListener('click', () => {
            const name = container.querySelector('#sheet-name').value.trim() || SHEET_CHARACTER.name;
            const hp = parseInt(container.querySelector('#sheet-hp').value) || 1;
            const dcMod = parseInt(container.querySelector('#sheet-dc-mod').value) || 0;
            const attackMod = parseInt(container.querySelector('#sheet-attack-mod').value) || 0;

            const newClasses = {};
            container.querySelectorAll('.sheet-class-level').forEach(input => {
                const val = parseInt(input.value) || 0;
                if (val > 0) newClasses[input.dataset.class] = val;
            });

            const newAttrs = {};
            container.querySelectorAll('.sheet-attr').forEach(input => {
                newAttrs[input.dataset.attr] = parseInt(input.value) || 10;
            });

            const newSlots = {};
            container.querySelectorAll('.sheet-slot-override').forEach(input => {
                newSlots[input.dataset.level] = parseInt(input.value) || 0;
            });

            const newPrepared = {};
            container.querySelectorAll('.sheet-prepared-override').forEach(input => {
                newPrepared[input.dataset.level] = parseInt(input.value) || 0;
            });

            const newSkillProficiencies = [];
            container.querySelectorAll('.sheet-skill-prof').forEach(input => {
                if (input.checked) newSkillProficiencies.push(input.dataset.skill);
            });

            const newSkillMods = {};
            container.querySelectorAll('.sheet-skill-mod').forEach(input => {
                const val = parseInt(input.value) || 0;
                if (val !== 0) newSkillMods[input.dataset.skill] = val;
            });

            SHEET_CHARACTER.name = name;
            SHEET_CHARACTER.classes = newClasses;
            SHEET_CHARACTER.attributes = newAttrs;
            SHEET_CHARACTER.stats = { hp };
            SHEET_CHARACTER.skill_proficiencies = newSkillProficiencies;
            SHEET_CHARACTER.custom_mods = {
                spell_dc_mod: dcMod,
                spell_attack_mod: attackMod,
                slots: newSlots,
                prepared: newPrepared,
                skills: newSkillMods
            };

            saveSheetData();
            renderCharSheet();
            renderSpellbook();
            renderClassFilters();
            renderCatalog();
        });

        container.querySelector('#reset-sheet').addEventListener('click', () => {
            if (confirm('Reset sheet to generated values? This will discard local edits.')) {
                localStorage.removeItem(SHEET_KEY);
                SHEET_CHARACTER = loadSheetData();
                renderCharSheet();
                renderSheetEditor();
                renderSpellbook();
                renderClassFilters();
                renderCatalog();
            }
        });
    }

    // -- Sigil building (see database/sigils/composition_def.md) ----------
    //
    // Every spell's sigil is assembled on the fly from the shared <symbol>
    // defs written into the page (see {{ SIGIL_DEFS }} in index.html) plus
    // the per-school topology data in SIGIL_SCHOOLS. Art is intentionally
    // sparse right now (most essences/intents/reach/flow/schools have no
    // asset yet) — resolveNamedAsset()/resolveTopology() fall back to
    // whatever is available so gaps are the exception, not something every
    // caller needs to special-case.

    function resolveNamedAsset(category, name) {
        const table = SIGIL_ASSETS[category] || {};
        const key = (name || '').toLowerCase();
        if (table[key]) return table[key];
        const fallbackKey = SIGIL_FALLBACKS[category];
        return fallbackKey ? table[fallbackKey] : null;
    }

    function pickSizedAsset(sizes, preferLarge) {
        if (!sizes) return null;
        if (preferLarge && sizes[100]) return sizes[100];
        if (sizes[50]) return sizes[50];
        const anySize = Object.keys(sizes)[0];
        return anySize ? sizes[anySize] : null;
    }

    function resolveTopology(schoolName, level) {
        let schoolKey = (schoolName || '').toLowerCase();
        let levels = SIGIL_SCHOOLS[schoolKey];
        if (!levels) {
            schoolKey = SIGIL_DEFAULT_SCHOOL;
            levels = schoolKey ? SIGIL_SCHOOLS[schoolKey] : null;
        }
        if (!levels) return null;

        const requested = String(level);
        let levelKey = levels[requested] ? requested : null;
        if (!levelKey) {
            const available = Object.keys(levels).map(Number);
            available.sort((a, b) => Math.abs(a - level) - Math.abs(b - level) || a - b);
            levelKey = String(available[0]);
        }
        return levels[levelKey];
    }

    function pickGeoAsset(randFactor) {
        const geo = SIGIL_ASSETS.geo || [];
        if (!geo.length) return null;
        const index = Math.floor((randFactor || 0) * geo.length) % geo.length;
        return geo[index];
    }

    // Fill `slots` with runes spelling out `name`, cycling back to the start
    // of the name whenever it runs out before the slots do. Characters with
    // no matching rune are skipped without consuming a slot.
    function fillWithRunesOnly(slots, name) {
        slots = slots || [];
        const runes = SIGIL_ASSETS.runes || {};
        const chars = (name || '').toLowerCase().split('').filter(ch => runes[ch]);
        if (!chars.length) return slots.map(() => null);
        return slots.map((_, i) => runes[chars[i % chars.length]]);
    }

    // Fill `slots` walking the spell name letter by letter (wrapping around
    // the whole slot set, not just per slot): spaces become a geo ornament,
    // letters with a rune become that rune, anything else is skipped.
    function fillWithRunesAndGeo(slots, name, randFactor) {
        slots = slots || [];
        const runes = SIGIL_ASSETS.runes || {};
        const chars = (name || '').split('');
        if (!chars.length) return slots.map(() => null);

        let cursor = 0;
        return slots.map(() => {
            for (let attempt = 0; attempt < chars.length; attempt++) {
                const ch = chars[cursor % chars.length];
                cursor++;
                if (ch === ' ') return pickGeoAsset(randFactor);
                const lower = ch.toLowerCase();
                if (runes[lower]) return runes[lower];
            }
            return null;
        });
    }

    // ornamentation_m / ornamentation_s symbols are drawn shrunk around the
    // slot centre; ornamentation_l and every other category are drawn at
    // their natural size.
    const ORNAMENTATION_SCALE = { ornamentation_m: 0.5, ornamentation_s: 0.3 };

    // Delay ranges per category for the --delay CSS custom property.
    // Each category maps to [rangeStart, rangeEnd] within 0–100.
    const SIGIL_DELAY_RANGES = {
        school:  [0,  10],
        essence: [10, 20],
        intent:  [20, 30],
        reach:   [30, 40],
        flow:    [40, 50],
        orn_l:   [50, 60],
        orn_m:   [60, 80],
        orn_s:   [80, 100],
    };

    // Probability threshold below which a school sub-group is skipped.
    const GROUP_SKIP_CHANCE = 0.3;

    // Minimum spell noise needed to rescale sub-group stroke widths.
    const SPELL_NOISE_THRESHOLD = 0.5;

    // Minimum non-zero stroke width for rescaled sub-group strokes. Values
    // below half this minimum collapse to 0; values below the minimum snap up.
    const MIN_STROKE_WIDTH = 0.2;

    function buildSigilPlacements(sp, spellName, topology) {
        const groups = {};

        const place = (cat, slots, sizePicker, scale) => {
            if (!groups[cat]) groups[cat] = [];
            (slots || []).forEach((slot, i) => {
                const asset = sizePicker(i);
                if (!asset) return;
                groups[cat].push({ slot, asset, scale: scale || 1 });
            });
        };

        const essenceTop = sp.essence_top || [];
        const intentTop = sp.intent_top || [];

        const essenceAsset = resolveNamedAsset('essence', essenceTop[0]);
        place('essence', topology.essence, i => pickSizedAsset(essenceAsset, i === 0));

        const intentAsset = resolveNamedAsset('intent', intentTop[0]);
        place('intent', topology.intent, i => pickSizedAsset(intentAsset, i === 0));

        place('reach', topology.reach, () => pickSizedAsset(resolveNamedAsset('reach', sp.reach), true));
        place('flow', topology.flow, () => pickSizedAsset(resolveNamedAsset('flow', sp.flow), true));

        const overflow = essenceTop.slice(1).map(name => ({ category: 'essence', name }))
            .concat(intentTop.slice(1).map(name => ({ category: 'intent', name })));

        const ornamentationL = topology.ornamentation_l || [];
        if (overflow.length) {
            place('orn_l', ornamentationL, i => {
                const item = overflow[i % overflow.length];
                return pickSizedAsset(resolveNamedAsset(item.category, item.name), false);
            });
        } else {
            const runeFills = fillWithRunesOnly(ornamentationL, spellName);
            place('orn_l', ornamentationL, i => runeFills[i]);
        }

        const style = sp.style || {};
        const mFills = fillWithRunesAndGeo(topology.ornamentation_m, spellName, style.rand_factor_1);
        place('orn_m', topology.ornamentation_m, i => mFills[i], ORNAMENTATION_SCALE.ornamentation_m);

        const sFills = fillWithRunesAndGeo(topology.ornamentation_s, spellName, style.rand_factor_5);
        place('orn_s', topology.ornamentation_s, i => sFills[i], ORNAMENTATION_SCALE.ornamentation_s);

        return groups;
    }

    // Compute a deterministic random seed for an entity from its
    // `random_group` array and the spell's stable `sigil_params.style`
    // rand_factor_N values. A group entry of 0 means "skip this factor".
    function get_random_seed(randomGroup, style) {
        if (!Array.isArray(randomGroup) || !style) return 0;
        let seed = 0;
        let used = false;
        let added = 0;
        for (const n of randomGroup) {
            if (n === 0) continue;
            const factor = style[`rand_factor_${n}`];
            if (typeof factor === 'number') {
                seed += factor;
                added += 1;
                used = true;
            }
        }
        seed = seed / added;
        return used ? seed : 0;
    }

    const SIGIL_MASK_SIZE = 1024;

    // --- Brightness noise overlay parameters ---
    const BRIGHTNESS_NOISE_BASE_FREQUENCY = 30.0;
    const BRIGHTNESS_NOISE_FREQUENCY_RANGE = 10.0;
    const BRIGHTNESS_NOISE_FREQUENCY_SPEED = 0.001;
    const BRIGHTNESS_NOISE_OCTAVES = 2;
    const BRIGHTNESS_NOISE_THRESHOLD = 0.7;
    const BRIGHTNESS_NOISE_SOFTNESS = 0.1;
    const BRIGHTNESS_NOISE_STRENGTH = 1.0;
    const BRIGHTNESS_NOISE_BRIGHTNESS = 0.0;
    const BRIGHTNESS_NOISE_OFFSET_SPEED = 0.1;

    let sigilGl = null;
    let sigilGlCanvas = null;
    let sigilGlProgram = null;
    let sigilGlUniforms = null;
    let sigilGlBuffer = null;
    let sigilGlTexture = null;
    let sigilGlSchoolTexture = null;
    let sigilGlTimingTexture = null;
    let sigilSourceCanvas = null;
    let sigilSourceCtx = null;
    let sigilGlReady = false;
    let sigilMaskHost = null;

    const sigilVertexShader = `
        attribute vec2 a_position;
        varying vec2 v_uv;

        void main() {
            v_uv = a_position * 0.5 + 0.5;
            gl_Position = vec4(a_position, 0.0, 1.0);
        }
    `;

    const sigilFragmentShader = `
        precision highp float;

        varying vec2 v_uv;

        uniform sampler2D u_shape;
        uniform sampler2D u_schoolShape;
        uniform sampler2D u_timing;
        uniform vec2  u_resolution;
        uniform float u_castProgress;
        uniform float u_fadeOut;
        uniform float u_fadeIn;

        uniform float u_dispFrequency;
        uniform float u_dispOctaves;
        uniform float u_dispSeed;
        uniform float u_dispScale;
        uniform float u_dispTurbulence;

        uniform float u_alphaFrequency;
        uniform float u_alphaOctaves;
        uniform float u_alphaSeed;
        uniform float u_alphaThreshold;
        uniform float u_alphaSoftness;
        uniform float u_alphaStrength;
        uniform float u_alphaTurbulence;

        uniform vec3  u_color;
        uniform vec3  u_brightnessColor;
        uniform float u_time;
        uniform float u_brightnessFrequency;
        uniform float u_brightnessFreqRange;
        uniform float u_brightnessFreqSpeed;
        uniform float u_brightnessOctaves;
        uniform float u_brightnessSeed;
        uniform float u_brightnessThreshold;
        uniform float u_brightnessSoftness;
        uniform float u_brightnessStrength;
        uniform float u_brightnessOffsetSpeed;

        float hash21(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
        }

        float valueNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);

            float a = hash21(i);
            float b = hash21(i + vec2(1.0, 0.0));
            float c = hash21(i + vec2(0.0, 1.0));
            float d = hash21(i + vec2(1.0, 1.0));

            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        float octaveNoise(vec2 p, float octaveCount, float seed, float turbulenceMode) {
            float total = 0.0;
            float amplitude = 0.5;
            float normalization = 0.0;

            for (int i = 0; i < 6; i++) {
                float enabled = 1.0 - step(octaveCount, float(i) + 0.5);

                float n = valueNoise(p + vec2(seed * 13.17, seed * 7.91));
                float signedNoise = n * 2.0 - 1.0;
                float turbulenceNoise = abs(signedNoise);
                float selected = mix(signedNoise * 0.5 + 0.5, turbulenceNoise, turbulenceMode);

                total += selected * amplitude * enabled;
                normalization += amplitude * enabled;

                p *= 2.0;
                amplitude *= 0.5;
            }

            return total / max(normalization, 0.0001);
        }

        vec2 displacedUV(vec2 uv) {
            float baseFreq = max(u_dispFrequency, 0.0001) * 16.0;
            float freq = mix(baseFreq, baseFreq + 10.0, u_fadeOut);
            float scale = mix(u_dispScale, 3.0, u_fadeOut);

            float nx = octaveNoise(uv * freq, u_dispOctaves, u_dispSeed, u_dispTurbulence);
            float ny = octaveNoise(uv * freq + vec2(19.37, 47.11), u_dispOctaves, u_dispSeed + 4.73, u_dispTurbulence);

            vec2 offset = vec2(nx, ny) * 2.0 - 1.0;
            vec2 pixelOffset = offset * scale;

            return uv + pixelOffset / u_resolution;
        }

        float erosionMask(vec2 uv) {
            float freq = max(u_alphaFrequency, 0.0001) * 1000.0;

            float n = octaveNoise(uv * freq, u_alphaOctaves, u_alphaSeed, u_alphaTurbulence);

            float halfSoftness = max(u_alphaSoftness * 0.5, 0.0005);
            float start = u_alphaThreshold - halfSoftness;
            float endv  = u_alphaThreshold + halfSoftness;

            float eroded = smoothstep(start, endv, n);
            return mix(1.0, eroded, u_alphaStrength);
        }

        // Fade-in erosion: threshold ramps 1→0 (reveals pixels).
        // Applied to all pixels during fade-in.
        float fadeInErosionMask(vec2 uv) {
            float freq = 100.0;

            float n = octaveNoise(uv * freq, u_alphaOctaves, u_alphaSeed, u_alphaTurbulence);

            float threshold = mix(0.5, 0.0, u_fadeIn);
            float halfSoftness = 0.25;
            float start = threshold - halfSoftness;
            float endv  = threshold + halfSoftness;

            return smoothstep(start, endv, n);
        }

        // Fade-out erosion: threshold ramps 0→1, frequency ramps 200→180.
        // Applied to all pixels, not just school geometry.
        float fadeOutErosionMask(vec2 uv) {
            float freq = mix(200.0, 180.0, u_fadeOut);

            float n = octaveNoise(uv * freq, u_alphaOctaves, u_alphaSeed, u_alphaTurbulence);

            float threshold = u_fadeOut;
            float halfSoftness = 0.25;
            float start = threshold - halfSoftness;
            float endv  = threshold + halfSoftness;

            return smoothstep(start, endv, n);
        }

        float brightnessOverlay(vec2 uv) {
            if (u_brightnessStrength < 0.001) return 0.0;

            // Offset animation: scroll downward
            vec2 brightnessUV = uv + vec2(0.0, -u_time * u_brightnessOffsetSpeed);

            // Frequency animation: triangle wave oscillation between
            // baseFreq - range and baseFreq + range
            float phase = fract(u_time * u_brightnessFreqSpeed);
            float triangle = abs(phase * 2.0 - 1.0);
            float freq = u_brightnessFrequency - u_brightnessFreqRange
                       + triangle * 2.0 * u_brightnessFreqRange;

            float n = octaveNoise(brightnessUV * freq, u_brightnessOctaves, u_brightnessSeed, 0.0);

            float halfSoftness = max(u_brightnessSoftness * 0.5, 0.0005);
            float mask = smoothstep(
                u_brightnessThreshold - halfSoftness,
                u_brightnessThreshold + halfSoftness,
                n
            );

            return mask * u_brightnessStrength;
        }

        void main() {
            vec2 duv = displacedUV(v_uv);

            if (duv.x < 0.0 || duv.x > 1.0 || duv.y < 0.0 || duv.y > 1.0) {
                gl_FragColor = vec4(0.0);
                return;
            }

            float sourceAlpha = texture2D(u_shape, duv).a;
            float schoolAlpha = texture2D(u_schoolShape, duv).a;
            float erosion = mix(1.0, erosionMask(duv), schoolAlpha);
            float alpha = sourceAlpha * erosion;

            // Fade-in erosion: reveals pixels during fade-in
            alpha *= fadeInErosionMask(duv);

            // Fade-out erosion: dissolves all pixels during fade-out
            alpha *= fadeOutErosionMask(duv);

            // Per-pixel staggered fade using timing texture
            float pixelTiming = texture2D(u_timing, duv).r;
            float fadeEdge = 0.08;
            float fade = smoothstep(pixelTiming - fadeEdge, pixelTiming + fadeEdge, u_castProgress);
            alpha *= fade;

            float glow = brightnessOverlay(v_uv);
            vec3 color = mix(u_color, u_brightnessColor, glow);

            gl_FragColor = vec4(color * alpha, alpha);
        }
    `;

    function initSigilWebGL() {
        if (sigilGlReady) return true;

        sigilGlCanvas = document.createElement('canvas');
        sigilGlCanvas.width = SIGIL_MASK_SIZE;
        sigilGlCanvas.height = SIGIL_MASK_SIZE;

        const gl = sigilGlCanvas.getContext('webgl', {
            alpha: true,
            antialias: false,
            depth: false,
            stencil: false,
            preserveDrawingBuffer: true,
            powerPreference: 'high-performance'
        }) || sigilGlCanvas.getContext('experimental-webgl');

        if (!gl) return false;
        sigilGl = gl;

        function compileShader(type, source) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                const message = gl.getShaderInfoLog(shader);
                gl.deleteShader(shader);
                throw new Error(message);
            }
            return shader;
        }

        function createProgram(vsSource, fsSource) {
            const vs = compileShader(gl.VERTEX_SHADER, vsSource);
            const fs = compileShader(gl.FRAGMENT_SHADER, fsSource);
            const program = gl.createProgram();
            gl.attachShader(program, vs);
            gl.attachShader(program, fs);
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                const message = gl.getProgramInfoLog(program);
                gl.deleteProgram(program);
                throw new Error(message);
            }
            return program;
        }

        try {
            sigilGlProgram = createProgram(sigilVertexShader, sigilFragmentShader);
        } catch (error) {
            console.error('Sigil WebGL init failed:', error);
            return false;
        }

        gl.useProgram(sigilGlProgram);

        sigilGlBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, sigilGlBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([
                -1, -1,
                 1, -1,
                -1,  1,
                -1,  1,
                 1, -1,
                 1,  1
            ]),
            gl.STATIC_DRAW
        );

        const positionLoc = gl.getAttribLocation(sigilGlProgram, 'a_position');
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

        sigilGlUniforms = {};
        [
            'u_shape',
            'u_schoolShape',
            'u_timing',
            'u_resolution',
            'u_castProgress',
            'u_fadeOut',
            'u_fadeIn',
            'u_dispFrequency',
            'u_dispOctaves',
            'u_dispSeed',
            'u_dispScale',
            'u_dispTurbulence',
            'u_alphaFrequency',
            'u_alphaOctaves',
            'u_alphaSeed',
            'u_alphaThreshold',
            'u_alphaSoftness',
            'u_alphaStrength',
            'u_alphaTurbulence',
            'u_color',
            'u_brightnessColor',
            'u_time',
            'u_brightnessFrequency',
            'u_brightnessFreqRange',
            'u_brightnessFreqSpeed',
            'u_brightnessOctaves',
            'u_brightnessSeed',
            'u_brightnessThreshold',
            'u_brightnessSoftness',
            'u_brightnessStrength',
            'u_brightnessOffsetSpeed'
        ].forEach(name => {
            sigilGlUniforms[name] = gl.getUniformLocation(sigilGlProgram, name);
        });

        sigilSourceCanvas = document.createElement('canvas');
        sigilSourceCanvas.width = SIGIL_MASK_SIZE;
        sigilSourceCanvas.height = SIGIL_MASK_SIZE;
        sigilSourceCtx = sigilSourceCanvas.getContext('2d');

        sigilGlTexture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sigilGlTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.uniform1i(sigilGlUniforms.u_shape, 0);

        sigilGlSchoolTexture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, sigilGlSchoolTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.uniform1i(sigilGlUniforms.u_schoolShape, 1);

        sigilGlTimingTexture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, sigilGlTimingTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.uniform1i(sigilGlUniforms.u_timing, 2);

        sigilGlReady = true;
        return true;
    }

    let sigilDefsHtml;

    function getSigilDefsHtml() {
        if (sigilDefsHtml === undefined) {
            const host = document.querySelector('body > svg[aria-hidden="true"]');
            const defs = host && host.querySelector('defs');
            sigilDefsHtml = defs ? defs.innerHTML : '';
        }
        return sigilDefsHtml;
    }

    function buildSigilMaskSourceSvg(targetSvg, size, schoolOnly) {
        let sourceSvg = targetSvg;
        if (schoolOnly) {
            sourceSvg = targetSvg.cloneNode(true);
            sourceSvg.querySelectorAll('.sigil-part').forEach(part => {
                if (!part.classList.contains('sigil-part-school')) {
                    part.remove();
                }
            });
        }

        const serializer = new XMLSerializer();
        const children = Array.from(sourceSvg.childNodes).map(n => serializer.serializeToString(n)).join('');
        const viewBox = targetSvg.getAttribute('viewBox') || '0 0 1000 1000';
        const preserve = targetSvg.getAttribute('preserveAspectRatio') || 'xMidYMid meet';
        const defs = getSigilDefsHtml();

        const styleBlock =
            '<style>' +
            '.sigil-symbol-path{fill:black!important;stroke:none!important;fill-opacity:1!important;}' +
            '.sigil-symbol-stroke{fill:none!important;fill-opacity:0!important;stroke:black!important;stroke-opacity:1!important;}' +
            '</style>';

        return (
            '<svg xmlns="http://www.w3.org/2000/svg" ' +
            'viewBox="' + viewBox + '" ' +
            'width="' + size + '" ' +
            'height="' + size + '" ' +
            'preserveAspectRatio="' + preserve + '">' +
            '<defs>' + defs + '</defs>' +
            styleBlock +
            children +
            '</svg>'
        );
    }

    // Build a timing SVG: each sigil-part is filled with a grayscale value
    // encoding its normalized reveal time (0=appears first, 1=appears last).
    // The fadein-delay CSS variable (in seconds) is read from each part's
    // inline style and normalized against the total fade-in duration.
    const SIGIL_FADE_IN_TOTAL = 0.4; // seconds: max delay + animation duration
    const SIGIL_FADE_OUT_TOTAL = 1.6; // seconds: max delay + animation duration

    function buildSigilTimingSvg(targetSvg, size, fadeOut) {
        const clone = targetSvg.cloneNode(true);
        const totalDuration = fadeOut ? SIGIL_FADE_OUT_TOTAL : SIGIL_FADE_IN_TOTAL;

        clone.querySelectorAll('.sigil-part').forEach(part => {
            const style = part.getAttribute('style') || '';
            const delayKey = fadeOut ? '--fadeout-delay' : '--fadein-delay';
            const match = new RegExp(delayKey + '\\s*:\\s*([\\d.]+)s').exec(style);
            const delay = match ? parseFloat(match[1]) : 0;
            const normalized = Math.min(1, delay / totalDuration);
            // Encode as grayscale: R channel = normalized timing
            const gray = Math.round(normalized * 255);
            part.querySelectorAll('use').forEach(use => {
                use.setAttribute('fill', `rgb(${gray},${gray},${gray})`);
                use.setAttribute('stroke', `rgb(${gray},${gray},${gray})`);
            });
        });

        const serializer = new XMLSerializer();
        const children = Array.from(clone.childNodes).map(n => serializer.serializeToString(n)).join('');
        const viewBox = targetSvg.getAttribute('viewBox') || '0 0 1000 1000';
        const preserve = targetSvg.getAttribute('preserveAspectRatio') || 'xMidYMid meet';
        const defs = getSigilDefsHtml();

        const styleBlock =
            '<style>' +
            '.sigil-symbol-path{fill:inherit!important;stroke:none!important;fill-opacity:1!important;}' +
            '.sigil-symbol-stroke{fill:none!important;fill-opacity:0!important;stroke:inherit!important;stroke-opacity:1!important;}' +
            '</style>';

        return (
            '<svg xmlns="http://www.w3.org/2000/svg" ' +
            'viewBox="' + viewBox + '" ' +
            'width="' + size + '" ' +
            'height="' + size + '" ' +
            'preserveAspectRatio="' + preserve + '">' +
            '<defs>' + defs + '</defs>' +
            styleBlock +
            children +
            '</svg>'
        );
    }

    function loadSvgImage(svgString) {
        return new Promise((resolve, reject) => {
            const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = (err) => {
                URL.revokeObjectURL(url);
                reject(err);
            };
            img.src = url;
        });
    }

    function setSigilUniforms(gl, params, time) {
        gl.uniform2f(sigilGlUniforms.u_resolution, SIGIL_MASK_SIZE, SIGIL_MASK_SIZE);
        gl.uniform1f(sigilGlUniforms.u_dispFrequency, params.dispFrequency);
        gl.uniform1f(sigilGlUniforms.u_dispOctaves, params.dispOctaves);
        gl.uniform1f(sigilGlUniforms.u_dispSeed, params.dispSeed);
        gl.uniform1f(sigilGlUniforms.u_dispScale, params.dispScale);
        gl.uniform1f(sigilGlUniforms.u_dispTurbulence, params.dispTurbulence);
        gl.uniform1f(sigilGlUniforms.u_alphaFrequency, params.alphaFrequency);
        gl.uniform1f(sigilGlUniforms.u_alphaOctaves, params.alphaOctaves);
        gl.uniform1f(sigilGlUniforms.u_alphaSeed, params.alphaSeed);
        gl.uniform1f(sigilGlUniforms.u_alphaThreshold, params.alphaThreshold);
        gl.uniform1f(sigilGlUniforms.u_alphaSoftness, params.alphaSoftness);
        gl.uniform1f(sigilGlUniforms.u_alphaStrength, params.alphaStrength);
        gl.uniform1f(sigilGlUniforms.u_alphaTurbulence, params.alphaTurbulence);

        const color = params.color || [1, 1, 1];
        gl.uniform3f(sigilGlUniforms.u_color, color[0], color[1], color[2]);

        // brightnessColor = lerp(brightnessColor, white, BRIGHTNESS_NOISE_BRIGHTNESS)
        const bc = params.brightnessColor || color;
        const bri = params.brightnessBrightness != null ? params.brightnessBrightness : BRIGHTNESS_NOISE_BRIGHTNESS;
        gl.uniform3f(sigilGlUniforms.u_brightnessColor,
            bc[0] + (1.0 - bc[0]) * bri,
            bc[1] + (1.0 - bc[1]) * bri,
            bc[2] + (1.0 - bc[2]) * bri
        );

        gl.uniform1f(sigilGlUniforms.u_time, time || 0);
        gl.uniform1f(sigilGlUniforms.u_brightnessFrequency, params.brightnessFrequency || BRIGHTNESS_NOISE_BASE_FREQUENCY);
        gl.uniform1f(sigilGlUniforms.u_brightnessFreqRange, params.brightnessFreqRange || BRIGHTNESS_NOISE_FREQUENCY_RANGE);
        gl.uniform1f(sigilGlUniforms.u_brightnessFreqSpeed, params.brightnessFreqSpeed || BRIGHTNESS_NOISE_FREQUENCY_SPEED);
        gl.uniform1f(sigilGlUniforms.u_brightnessOctaves, params.brightnessOctaves || BRIGHTNESS_NOISE_OCTAVES);
        gl.uniform1f(sigilGlUniforms.u_brightnessSeed, params.brightnessSeed || 0);
        gl.uniform1f(sigilGlUniforms.u_brightnessThreshold, params.brightnessThreshold || BRIGHTNESS_NOISE_THRESHOLD);
        gl.uniform1f(sigilGlUniforms.u_brightnessSoftness, params.brightnessSoftness || BRIGHTNESS_NOISE_SOFTNESS);
        gl.uniform1f(sigilGlUniforms.u_brightnessStrength, params.brightnessStrength || 0);
        gl.uniform1f(sigilGlUniforms.u_brightnessOffsetSpeed, params.brightnessOffsetSpeed || BRIGHTNESS_NOISE_OFFSET_SPEED);
        gl.uniform1f(sigilGlUniforms.u_castProgress, params.castProgress != null ? params.castProgress : 1.0);
        gl.uniform1f(sigilGlUniforms.u_fadeOut, params.fadeOut || 0.0);
        gl.uniform1f(sigilGlUniforms.u_fadeIn, params.fadeIn != null ? params.fadeIn : 1.0);
    }

    // Decoding the mask/school/timing SVGs into rasterized images is the
    // actual cost behind cast-start stutter (loadSvgImage forces the browser
    // to rasterize SVG-with-<use> references at SIGIL_MASK_SIZE). It's
    // deterministic per spell+level (see imageCacheKey above), so an LRU of
    // decoded images lets repeat casts of the same spell skip straight to
    // texture upload. Capped small — each entry holds three ~1024x1024 RGBA
    // decoded bitmaps (~4MB each, ~12MB/entry), which adds up fast on
    // mobile's tighter memory budget, so this only keeps "current + a
    // handful of recent" rather than a whole spellbook's worth.
    const SIGIL_IMAGE_CACHE_MAX = 6;
    const sigilImageCache = new Map();

    function getOrLoadSigilImages(targetSvg, size, cacheKey) {
        if (cacheKey && sigilImageCache.has(cacheKey)) {
            const cached = sigilImageCache.get(cacheKey);
            // Touch for LRU: re-insertion moves it to the end (most-recent).
            sigilImageCache.delete(cacheKey);
            sigilImageCache.set(cacheKey, cached);
            return cached;
        }

        const fullSvg = buildSigilMaskSourceSvg(targetSvg, size, false);
        const schoolSvg = buildSigilMaskSourceSvg(targetSvg, size, true);
        const timingSvg = buildSigilTimingSvg(targetSvg, size, false);

        const promise = Promise.all([loadSvgImage(fullSvg), loadSvgImage(schoolSvg), loadSvgImage(timingSvg)])
            .then(([fullImg, schoolImg, timingImg]) => ({ fullImg, schoolImg, timingImg }));

        if (cacheKey) {
            sigilImageCache.set(cacheKey, promise);
            if (sigilImageCache.size > SIGIL_IMAGE_CACHE_MAX) {
                sigilImageCache.delete(sigilImageCache.keys().next().value);
            }
            // Don't keep a failed decode cached — let the next attempt retry.
            promise.catch(() => sigilImageCache.delete(cacheKey));
        }

        return promise;
    }

    // `onDrawn`, when given, runs synchronously right after gl.drawArrays,
    // still inside this same .then callback — before control returns to the
    // microtask queue. This matters because sigilGlCanvas/textures are a
    // single shared scratch buffer reused by every sigil render (immersive
    // pages, cast modal, idle pulses). If "draw" and "read the result back
    // out" were split across two separate .then hops (as they used to be —
    // draw here, copy-out in the caller's own .then), a second concurrent
    // render's draw could land in between and get copied out by the first
    // render's caller instead of its own. That's exactly what image caching
    // exposed: a cached (already-resolved) render now finishes within the
    // same microtask flush as others, instead of always being paced apart by
    // real, separately-scheduled image-decode tasks — so two renders' hops
    // could interleave where before they couldn't. Passing the copy-out in
    // as onDrawn keeps "this render's draw" and "this render's read-back"
    // as one atomic step regardless of how other renders' promises resolve.
    function renderSigil(targetSvg, params, time, onDrawn) {
        if (!sigilGlReady && !initSigilWebGL()) return Promise.resolve(null);

        const size = SIGIL_MASK_SIZE;
        const gl = sigilGl;
        const wrap = targetSvg.closest('.sigil-mask-wrap');
        const cacheKey = wrap ? wrap.dataset.sigilCacheKey : null;

        return getOrLoadSigilImages(targetSvg, size, cacheKey).then(({ fullImg, schoolImg, timingImg }) => {
            if (sigilGlCanvas.width !== size || sigilGlCanvas.height !== size) {
                sigilGlCanvas.width = size;
                sigilGlCanvas.height = size;
                gl.viewport(0, 0, size, size);
            }

            sigilSourceCtx.clearRect(0, 0, size, size);
            sigilSourceCtx.drawImage(fullImg, 0, 0, size, size);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, sigilGlTexture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.RGBA,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                sigilSourceCanvas
            );

            sigilSourceCtx.clearRect(0, 0, size, size);
            sigilSourceCtx.drawImage(schoolImg, 0, 0, size, size);

            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, sigilGlSchoolTexture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.RGBA,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                sigilSourceCanvas
            );

            sigilSourceCtx.clearRect(0, 0, size, size);
            sigilSourceCtx.drawImage(timingImg, 0, 0, size, size);

            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, sigilGlTimingTexture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.RGBA,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                sigilSourceCanvas
            );

            setSigilUniforms(gl, params, time || 0);

            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawArrays(gl.TRIANGLES, 0, 6);

            const result = { fullImg, schoolImg, timingImg };
            if (onDrawn) onDrawn(result);
            return result;
        }).catch(err => {
            console.error('Failed to load sigil source SVGs for WebGL render', err);
            return null;
        });
    }

    // Re-render a sigil frame using previously-loaded textures (for animation).
    function renderSigilFrame(entry, time) {
        const gl = sigilGl;
        const size = SIGIL_MASK_SIZE;

        if (sigilGlCanvas.width !== size || sigilGlCanvas.height !== size) {
            sigilGlCanvas.width = size;
            sigilGlCanvas.height = size;
            gl.viewport(0, 0, size, size);
        }

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sigilGlTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, entry.fullImg);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, sigilGlSchoolTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, entry.schoolImg);

        if (entry.timingImg) {
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, sigilGlTimingTexture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, entry.timingImg);
        }

        setSigilUniforms(gl, entry.params, time);

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        entry.ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
        entry.ctx.drawImage(sigilGlCanvas, 0, 0, entry.canvas.width, entry.canvas.height);
    }

    // --- Animated sigil rendering ---
    let sigilAnimationEntries = [];
    let sigilAnimationId = null;

    function clearIdleSymbolPulse(entry) {
        if (entry.idleSymbolTimer) {
            clearTimeout(entry.idleSymbolTimer);
            entry.idleSymbolTimer = null;
        }
        entry.wrap.querySelectorAll('.sigil-idle-overlay').forEach(overlay => overlay.remove());
    }

    function scheduleIdleSymbolPulse(entry) {
        if (entry.idleSymbolTimer) clearTimeout(entry.idleSymbolTimer);
        entry.idleSymbolTimer = setTimeout(() => {
            entry.idleSymbolTimer = null;
            if (!entry.canvas.isConnected || entry.fadePhase !== 'idle') return;
            const parts = Array.from(entry.target.querySelectorAll('.sigil-part:not(.sigil-part-school)'));
            if (!parts.length) return;
            const part = parts[Math.floor(Math.random() * parts.length)];
            const outer = part.parentElement.cloneNode(true);
            const pulseSvg = entry.target.cloneNode(false);
            pulseSvg.removeAttribute('style');
            pulseSvg.appendChild(outer);

            const transform = outer.getAttribute('transform') || '';
            const position = /translate\(\s*([\d.-]+)[ ,]+([\d.-]+)\s*\)/.exec(transform);
            const viewBox = (entry.target.getAttribute('viewBox') || '0 0 1000 1000').split(/\s+/).map(Number);
            const originX = position ? (Number(position[1]) - viewBox[0]) / viewBox[2] * 100 : 50;
            const originY = position ? (Number(position[2]) - viewBox[1]) / viewBox[3] * 100 : 50;
            const pulseParams = {
                ...entry.params,
                dispFrequency: 200,
                dispScale: 20,
                castProgress: 1,
                fadeIn: 1,
                fadeOut: 0,
                brightnessStrength: 0
            };

            // Copy-out passed as onDrawn (not a chained .then) so it can't be
            // beaten to the shared canvas by another concurrent render — see
            // renderSigil's onDrawn comment.
            renderSigil(pulseSvg, pulseParams, 0, () => {
                if (!entry.canvas.isConnected || entry.fadePhase !== 'idle') return;
                const overlay = document.createElement('div');
                overlay.className = 'sigil-idle-overlay';
                const canvas = document.createElement('canvas');
                canvas.width = SIGIL_MASK_SIZE;
                canvas.height = SIGIL_MASK_SIZE;
                canvas.className = 'sigil-idle-copy';
                canvas.style.transformOrigin = `${originX}% ${originY}%`;
                canvas.getContext('2d').drawImage(sigilGlCanvas, 0, 0, canvas.width, canvas.height);
                overlay.appendChild(canvas);
                entry.wrap.appendChild(overlay);

                const removeOverlay = () => overlay.remove();
                canvas.addEventListener('animationend', removeOverlay, { once: true });
                setTimeout(removeOverlay, 1200);
            }).finally(() => {
                if (entry.canvas.isConnected && entry.fadePhase === 'idle') scheduleIdleSymbolPulse(entry);
            });
        }, 3000 + Math.random() * 2000);
    }

    function sigilAnimationLoop(timestamp) {
        const time = timestamp * 0.001;
        // Remove detached entries
        for (let i = sigilAnimationEntries.length - 1; i >= 0; i--) {
            if (!sigilAnimationEntries[i].canvas.isConnected) {
                clearIdleSymbolPulse(sigilAnimationEntries[i]);
                sigilAnimationEntries.splice(i, 1);
            }
        }
        if (sigilAnimationEntries.length === 0) {
            sigilAnimationId = null;
            return;
        }
        for (const entry of sigilAnimationEntries) {
            if (entry.canvas.offsetParent !== null) {
                // Update castProgress and fadeOut based on fade phase
                const elapsed = (timestamp - entry.castStartTime) * 0.001;
                if (entry.fadePhase === 'in') {
                    entry.params.castProgress = Math.min(1, elapsed / SIGIL_FADE_IN_TOTAL);
                    entry.params.fadeIn = Math.min(1, elapsed / SIGIL_FADE_IN_TOTAL);
                    entry.params.fadeOut = 0;
                    if (entry.params.fadeIn === 1) {
                        entry.fadePhase = 'idle';
                        scheduleIdleSymbolPulse(entry);
                    }
                } else if (entry.fadePhase === 'out') {
                    const fadeElapsed = (timestamp - entry.fadeOutStartTime) * 0.001;
                    entry.params.castProgress = Math.max(0, 1 - fadeElapsed / SIGIL_FADE_OUT_TOTAL);
                    entry.params.fadeIn = 1;
                    entry.params.fadeOut = Math.min(1, fadeElapsed / SIGIL_FADE_OUT_TOTAL);
                } else {
                    entry.params.castProgress = 1;
                    entry.params.fadeIn = 1;
                    entry.params.fadeOut = 0;
                }
                renderSigilFrame(entry, time);
            }
        }
        sigilAnimationId = requestAnimationFrame(sigilAnimationLoop);
    }

    function startSigilAnimation() {
        if (sigilAnimationId !== null) return;
        sigilAnimationId = requestAnimationFrame(sigilAnimationLoop);
    }

    function stopSigilAnimation() {
        if (sigilAnimationId !== null) {
            cancelAnimationFrame(sigilAnimationId);
            sigilAnimationId = null;
        }
    }

    // Helper: convert [r,g,b] (0-1) to [h,s,l] (h: 0-360, s/l: 0-1)
    function rgbToHsl(r, g, b) {
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        var h, s, l = (max + min) / 2;
        if (max === min) {
            h = s = 0;
        } else {
            var d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
            else if (max === g) h = ((b - r) / d + 2) * 60;
            else h = ((r - g) / d + 4) * 60;
        }
        return [h, s, l];
    }

    // Helper: convert [h,s,l] (h: 0-360, s/l: 0-1) to [r,g,b] (0-1)
    function hslToRgb(h, s, l) {
        if (s === 0) return [l, l, l];
        h = ((h % 360) + 360) % 360;
        var c = (1 - Math.abs(2 * l - 1)) * s;
        var x = c * (1 - Math.abs((h / 60) % 2 - 1));
        var m = l - c / 2;
        var r, g, b;
        if (h < 60) { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }
        return [r + m, g + m, b + m];
    }

    // Helper: convert sRGB channel (0-1) to linear RGB
    function srgbChannelToLinear(c) {
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }

    // Helper: calculate perceived luminance (sRGB relative luminance)
    function perceivedLuminance(r, g, b) {
        return 0.2126 * srgbChannelToLinear(r) +
               0.7152 * srgbChannelToLinear(g) +
               0.0722 * srgbChannelToLinear(b);
    }

    // Helper: binary-search HSL lightness to match a target perceived luminance
    function solveHslLightnessForLuminance(h, s, targetLum) {
        var lo = 0.0, hi = 1.0;
        for (var i = 0; i < 16; i++) {
            var mid = (lo + hi) / 2;
            var rgb = hslToRgb(h, s, mid);
            var lum = perceivedLuminance(rgb[0], rgb[1], rgb[2]);
            if (lum < targetLum) lo = mid;
            else hi = mid;
        }
        return (lo + hi) / 2;
    }

    const HUE_SHIFT_PERCEIVED_LUMINANCE_OFFSET = 0.15;

    // Helper: parse CSS color string to [r, g, b] normalized 0-1
    function parseColorToVec3(colorStr) {
        if (!colorStr) return [1, 1, 1];
        const match = /rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/i.exec(colorStr);
        if (match) return [parseFloat(match[1]) / 255, parseFloat(match[2]) / 255, parseFloat(match[3]) / 255];
        // Try hex
        const hex = /^#?([0-9a-f]{6})$/i.exec(colorStr.trim());
        if (hex) {
            const h = hex[1];
            return [parseInt(h.slice(0,2), 16) / 255, parseInt(h.slice(2,4), 16) / 255, parseInt(h.slice(4,6), 16) / 255];
        }
        return [1, 1, 1];
    }

    function getSigilRenderParams(spellStyle, color) {
        const style = spellStyle || {};
        const vectorNoise = typeof style.vector_noise === 'number' ? style.vector_noise : 0;
        const angleNoise = typeof style.angle_noise === 'number' ? style.angle_noise : 0;
        const positionNoise = typeof style.position_noise === 'number' ? style.position_noise : 0;
        const randFactor1 = typeof style.rand_factor_1 === 'number' ? style.rand_factor_1 : 0;
        const randFactor5 = typeof style.rand_factor_5 === 'number' ? style.rand_factor_5 : 0;

        // Brightness variation color: hue-shift color1 based on mean noise
        // HUE-SHIFT
        var brightnessColor = null;
        var hueShift = 0;
        if (color) {
            // 1. Measure original perceived luminance
            const originalPercL = perceivedLuminance(color[0], color[1], color[2]);

            // 2. Apply hue shift (existing logic)
            const meanNoise = (vectorNoise + angleNoise + positionNoise) / 3.0;
            hueShift = 15 + (20 * meanNoise); // brightness_hue_rotation
            if (randFactor1 < 0.5) hueShift *= -1;
            const hsl = rgbToHsl(color[0], color[1], color[2]);
            const shiftedHue = hsl[0] + hueShift;
            const shiftedSat = hsl[1];

            // 3. Solve lightness so perceived luminance ≈ original + offset
            const targetPercL = Math.max(0, Math.min(1, originalPercL + HUE_SHIFT_PERCEIVED_LUMINANCE_OFFSET));
            const solvedL = solveHslLightnessForLuminance(shiftedHue, shiftedSat, targetPercL);

            brightnessColor = hslToRgb(shiftedHue, shiftedSat, solvedL);
        }

        return {
            dispFrequency: 2 + angleNoise * 2,
            dispOctaves: 2,
            dispSeed: randFactor5 * 2,
            dispScale: vectorNoise * 1.5,
            dispTurbulence: 1,
            alphaFrequency: 0.30,
            alphaOctaves: 1,
            alphaSeed: randFactor5 * 2,
            alphaThreshold: positionNoise * 0.3,
            alphaSoftness: 0.001,
            alphaStrength: randFactor5,
            alphaTurbulence: 0,
            color: color || null,
            brightnessColor: brightnessColor,
            brightnessHueShift: hueShift,
            brightnessSeed: randFactor5 * 3.7,
            brightnessStrength: 0,
            brightnessBrightness: BRIGHTNESS_NOISE_BRIGHTNESS,
            brightnessFrequency: BRIGHTNESS_NOISE_BASE_FREQUENCY,
            brightnessFreqRange: BRIGHTNESS_NOISE_FREQUENCY_RANGE,
            brightnessFreqSpeed: BRIGHTNESS_NOISE_FREQUENCY_SPEED,
            brightnessOctaves: BRIGHTNESS_NOISE_OCTAVES,
            brightnessThreshold: BRIGHTNESS_NOISE_THRESHOLD,
            brightnessSoftness: BRIGHTNESS_NOISE_SOFTNESS,
            brightnessOffsetSpeed: BRIGHTNESS_NOISE_OFFSET_SPEED
        };
    }

    function applySigilMasks(root) {
        if (!sigilGlReady && !initSigilWebGL()) return;

        root = root || document;
        const wraps = root.querySelectorAll('.sigil-mask-wrap:not([data-sigil-mask-applied])');
        if (!wraps.length) return;

        wraps.forEach(wrap => {
            wrap.setAttribute('data-sigil-mask-applied', '');

            const target = wrap.querySelector('.sigil-mask-target');
            if (!target) return;

            const paramsAttr = wrap.getAttribute('data-sigil-mask');
            if (!paramsAttr) return;

            try {
                const params = JSON.parse(paramsAttr);
                const isCast = wrap.classList.contains('cast-sigil');

                // Resolve color: if not baked into params, read from computed CSS
                if (!params.color) {
                    const computed = window.getComputedStyle(wrap);
                    const cssColor = computed.color || 'rgb(255, 255, 255)';
                    params.color = parseColorToVec3(cssColor);
                }
                // Compute brightnessColor via hue shift from resolved color
                if (!params.brightnessColor && params.brightnessHueShift != null) {
                    const hsl = rgbToHsl(params.color[0], params.color[1], params.color[2]);
                    params.brightnessColor = hslToRgb(hsl[0] + params.brightnessHueShift, hsl[1], hsl[2]);
                } else if (!params.brightnessColor) {
                    params.brightnessColor = params.color;
                }

                // For cast sigils: enable brightness animation
                if (isCast) {
                    params.brightnessStrength = BRIGHTNESS_NOISE_STRENGTH;
                }

                renderSigil(target, params, 0, (result) => {
                    // Hide the SVG source, show a canvas with the rendered output.
                    // Runs as part of renderSigil's own draw step (see its
                    // onDrawn comment) so this copy-out can't be beaten to the
                    // shared canvas by another concurrent render.
                    target.style.display = 'none';

                    const canvas = document.createElement('canvas');
                    canvas.width = SIGIL_MASK_SIZE;
                    canvas.height = SIGIL_MASK_SIZE;
                    canvas.className = 'sigil-render-canvas';
                    wrap.appendChild(canvas);

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(sigilGlCanvas, 0, 0, canvas.width, canvas.height);

                    if (isCast) {
                        // Start with castProgress = 0 (invisible), animate up
                        params.castProgress = 0;
                        params.fadeIn = 0;
                        // Register for animation
                        const entry = {
                            canvas: canvas,
                            ctx: ctx,
                            wrap: wrap,
                            target: target,
                            params: params,
                            fullImg: result.fullImg,
                            schoolImg: result.schoolImg,
                            timingImg: result.timingImg,
                            castStartTime: performance.now(),
                            fadePhase: 'in'
                        };
                        sigilAnimationEntries.push(entry);
                        startSigilAnimation();
                    }
                }).catch(err => {
                    console.error('Failed to render sigil', err);
                });
            } catch (err) {
                console.error('Failed to apply sigil rendering', err);
            }
        });
    }

    // Warms the decoded-image LRU for the spells most likely to be cast next,
    // so their first real cast doesn't pay the SVG-decode cost that otherwise
    // shows up as stutter at the start of the cast animation. Built off a
    // detached DOM node — decoding doesn't require the sigil to be visible or
    // attached to the document. Capped to the image cache's own size: warming
    // more than it holds would just evict earlier entries before they're used.
    function prefetchPreparedSigils() {
        if (!sigilGlReady && !initSigilWebGL()) return;

        const preparedIds = getPrepared().slice(0, SIGIL_IMAGE_CACHE_MAX);
        preparedIds.forEach(id => {
            const spell = findSpell(id);
            if (!spell || !spell.sigil_params) return;

            const markup = buildSigilSvg(spell);
            if (!markup) return;

            const container = document.createElement('div');
            container.innerHTML = markup;
            const wrap = container.querySelector('.sigil-mask-wrap');
            const targetSvg = container.querySelector('svg.sigil-mask-target');
            if (!wrap || !targetSvg) return;

            getOrLoadSigilImages(targetSvg, SIGIL_MASK_SIZE, wrap.dataset.sigilCacheKey).catch(() => {});
        });
    }

    function get_spell_noise(style) {
        if (!style) return 0;
        const vector = typeof style.vector_noise === 'number' ? style.vector_noise : 0;
        const angle = typeof style.angle_noise === 'number' ? style.angle_noise : 0;
        const position = typeof style.position_noise === 'number' ? style.position_noise : 0;
        return (vector + angle + position) / 3.0;
    }

    function symbolRandomGroup(entityMap) {
        if (!entityMap || !entityMap.groups) return null;
        for (const key in entityMap.groups) {
            if (entityMap.groups[key].category === 'main') {
                return entityMap.groups[key].random_group;
            }
        }
        return null;
    }

    // `level` defaults to the spell's own level, but callers casting at a
    // higher slot level (or the cast modal, which shows the slot level that
    // was actually used) can override it — it drives both the topology
    // lookup and the viewBox crop.

    // Fade-in style: 'by_group' fades whole categories at once (using
    // SIGIL_FADEIN_DELAY), 'one_by_one' staggers each part individually
    // (using --delay * multiplier).
    const FADE_IN_STYLE = 'by_group';

    // Fade-in phase per category (seconds).
    const SIGIL_FADEIN_DELAY = {
        school:  0.1,
        essence: 0.0,
        intent:  0.1,
        reach:   0.1,
        flow:    0.1,
        orn_l:   0.1,
        orn_m:   0.2,
        orn_s:   0.2,
    };

    // Fade-out phase per category (seconds).
    const SIGIL_FADEOUT_DELAY = {
        school:  0.4,
        essence: 0.6,
        intent:  0.2,
        reach:   0.2,
        flow:    0.2,
        orn_l:   0,
        orn_m:   0,
        orn_s:   0,
    };

    let castFadeOutTimer = null;

    function startCastFadeOut(modal, onDone) {
        // Trigger fade-out phase on all active sigil animation entries
        const now = performance.now();
        for (const entry of sigilAnimationEntries) {
            clearIdleSymbolPulse(entry);
            entry.fadePhase = 'out';
            entry.fadeOutStartTime = now;
        }
        modal.classList.add('fading-out');
        castFadeOutTimer = setTimeout(() => {
            castFadeOutTimer = null;
            if (onDone) onDone();
        }, SIGIL_FADE_OUT_TOTAL * 1000 + 200);
    }

    function cancelCastFadeOut() {
        if (castFadeOutTimer) {
            clearTimeout(castFadeOutTimer);
            castFadeOutTimer = null;
        }
    }

    // Markup returned by buildSigilSvg is a pure function of (spell, level,
    // className) — every seemingly-random choice inside it (rotation flips,
    // stroke-width, group skipping) derives from get_random_seed(), which is
    // deterministic given the symbol's baked-in entity_map and the spell's
    // own sigil_params.style. Safe to cache and reuse across re-renders
    // (catalog cards, spellbook cards, immersive pages all rebuild the same
    // spell's markup repeatedly). Capped as a sanity net, not because normal
    // spellbook sizes could realistically fill it.
    const SIGIL_MARKUP_CACHE_MAX = 100;
    const sigilMarkupCache = new Map();

    function buildSigilSvg(spell, { level, className, style } = {}) {
        const sp = spell.sigil_params;
        if (!sp) return '';
        const sigilLevel = level !== undefined ? level : spell.level;
        const svgClass = className || 'immersive-sigil';
        const markupKey = `${spell.id}:${sigilLevel}:${svgClass}`;
        const cachedMarkup = sigilMarkupCache.get(markupKey);
        if (cachedMarkup !== undefined) return cachedMarkup;

        const resolved = resolveTopology(sp.school, sigilLevel);
        if (!resolved) return '';

        const groups = buildSigilPlacements(sp, spell.name || '', resolved.topology || {});

        const baseSize = resolved.symbol.size;
        const [schoolLo, schoolHi] = SIGIL_DELAY_RANGES.school;
        const uses = [];

        // School base symbol: draw each entity separately. Sub-groups with a
        // low random seed are omitted; stroke entities may have their
        // stroke-width rescaled when the spell's overall noise is high enough.
        const spellStyle = sp.style || {};
        const spellNoise = get_spell_noise(spellStyle);
        // Threshold gating whether variable-rotation topology slots keep
        // their baked-in rotation or snap to 0, checked per placement group
        // (see the categoryOrder loop below) against the group's own seed.
        const angleNoise = typeof spellStyle.angle_noise === 'number' ? spellStyle.angle_noise : 0;
        const schoolGroups = resolved.groups || [];
        const visibleSchoolGroups = schoolGroups.filter(group => {
            const seed = get_random_seed(group.random_group, sp.style || {});
            return !(group.category === 'sub' && seed <= GROUP_SKIP_CHANCE);
        });
        if (visibleSchoolGroups.length) {
            visibleSchoolGroups.forEach((group, groupIdx) => {
                const groupDelay = schoolLo + ((groupIdx + 1) / visibleSchoolGroups.length * (schoolHi - schoolLo));
                const isSubGroup = group.category === 'sub';

                // For sub-groups under high spell noise, pick a single shared
                // stroke-width from the first stroke entity and apply it to
                // every stroke entity in the group.
                let groupStrokeWidth = null;
                if (isSubGroup && spellNoise >= SPELL_NOISE_THRESHOLD) {
                    const firstStroke = (group.entities || []).find(
                        e => e.stroke_width != null && e.is_stroke
                    );
                    if (firstStroke) {
                        const style = sp.style || {};
                        const shapeNoise = typeof style.vector_noise === 'number' ? style.vector_noise : 0;
                        let scaledWidth = firstStroke.stroke_width * shapeNoise;
                        if (scaledWidth < MIN_STROKE_WIDTH / 2) {
                            scaledWidth = 0;
                        } else if (scaledWidth < MIN_STROKE_WIDTH) {
                            scaledWidth = MIN_STROKE_WIDTH;
                        }
                        groupStrokeWidth = scaledWidth;
                    }
                }

                (group.entities || []).forEach(entity => {
                    const seed = get_random_seed(entity.random_group, sp.style || {});
                    let strokeAttr = '';
                    if (groupStrokeWidth != null && entity.is_stroke) {
                        strokeAttr = ` stroke-width="${groupStrokeWidth}"`;
                    }
                    const schoolCenter = baseSize / 2;
                    uses.push(
                        `<g transform="translate(${schoolCenter},${schoolCenter})">` +
                        `<g class="sigil-part sigil-part-school" style="--delay:${groupDelay};--fadein-delay:${SIGIL_FADEIN_DELAY.school}s;--fadeout-delay:${SIGIL_FADEOUT_DELAY.school}s;transform-origin:0px 0px">` +
                        `<use href="#${entity.symbol.id}" width="${baseSize}" height="${baseSize}" x="${-schoolCenter}" y="${-schoolCenter}"${strokeAttr} data-seed="${seed}"/>` +
                        `</g></g>`
                    );
                });
            });
        } else {
            // Fallback to the whole school symbol when no per-entity data exists.
            const baseSeed = get_random_seed(symbolRandomGroup(SIGIL_ENTITY_MAPS[resolved.symbol.id]), sp.style || {});
            const schoolDelay = schoolLo + (schoolHi - schoolLo);
            const schoolCenter = baseSize / 2;
            uses.push(
                `<g transform="translate(${schoolCenter},${schoolCenter})">` +
                `<g class="sigil-part sigil-part-school" style="--delay:${schoolDelay};--fadein-delay:${SIGIL_FADEIN_DELAY.school}s;--fadeout-delay:${SIGIL_FADEOUT_DELAY.school}s;transform-origin:0px 0px">` +
                `<use href="#${resolved.symbol.id}" width="${baseSize}" height="${baseSize}" x="${-schoolCenter}" y="${-schoolCenter}" data-seed="${baseSeed}"/>` +
                `</g></g>`
            );
        }

        const categoryOrder = ['essence', 'intent', 'reach', 'flow', 'orn_l', 'orn_m', 'orn_s'];
        categoryOrder.forEach(cat => {
            const items = groups[cat];
            if (!items || !items.length) return;
            const [lo, hi] = SIGIL_DELAY_RANGES[cat];
            const span = hi - lo;

            // The group's own seed (from its first placed symbol's entity_map)
            // decides, once per group, whether every variable-rotation slot in
            // it ignores the topology's baked-in rotation and snaps to 0.
            const groupSeed = get_random_seed(symbolRandomGroup(SIGIL_ENTITY_MAPS[items[0].asset.id]), spellStyle);
            const ignoreGroupRotation = groupSeed > angleNoise;

            // For ornamentation_m / ornamentation_s, that same group seed also
            // decides an extra 180deg flip applied on top of the above: when
            // the seed is at or below rand_factor_4, every symbol in the group
            // is rotated an additional 180 degrees.
            const rand_factor_4 = typeof spellStyle.rand_factor_4 === 'number' ? spellStyle.rand_factor_4 : 0;
            const flipGroup = (cat === 'orn_m' || cat === 'orn_s') && groupSeed <= rand_factor_4;

            items.forEach(({ slot, asset, scale }, idx) => {
                const delay = lo + ((idx + 1) / items.length * span);
                const half = asset.size / 2;
                const scaleAttr = scale && scale !== 1 ? ` scale(${scale})` : '';
                const seed = get_random_seed(symbolRandomGroup(SIGIL_ENTITY_MAPS[asset.id]), spellStyle);
                let rotation = (slot.variable_rotation && ignoreGroupRotation) ? 0 : slot.rotation;
                if (flipGroup) rotation += 180;
                const fiDelay = SIGIL_FADEIN_DELAY[cat] || 0;
                const foDelay = SIGIL_FADEOUT_DELAY[cat] || 0;
                uses.push(
                    `<g transform="translate(${slot.x},${slot.y}) rotate(${rotation})${scaleAttr}">` +
                    `<g class="sigil-part" style="--delay:${delay};--fadein-delay:${fiDelay}s;--fadeout-delay:${foDelay}s;transform-origin:0px 0px">` +
                    `<use href="#${asset.id}" width="${asset.size}" height="${asset.size}" x="${-half}" y="${-half}" data-seed="${seed}"/>` +
                    `</g></g>`
                );
            });
        });

        const styleAttr = style ? ` style="${style}"` : '';

        // WebGL rendering parameters. The sigil is rendered to a visible canvas
        // once inserted into the DOM — the shader outputs colored pixels directly.
        // Cast sigils bake the spell's own color; immersive sigils leave it null
        // so applySigilMasks resolves the theme's accent at apply-time.
        const isCastBuild = (className === 'cast-sigil');
        const colorVec = isCastBuild && spellStyle.color_1 ? parseColorToVec3(spellStyle.color_1) : null;
        const renderParams = getSigilRenderParams(spellStyle, colorVec);
        const paramsAttr = JSON.stringify(renderParams).replace(/"/g, '&quot;');

        // The rasterized mask (full/school/timing shape) below is styled flat
        // black/white by buildSigilMaskSourceSvg regardless of className, so
        // it's identical between cast and immersive renders of the same
        // spell+level — the image cache key deliberately omits svgClass so
        // both variants share one decoded entry.
        const imageCacheKey = `${spell.id}:${sigilLevel}`;

        const markup = `<div class="sigil-mask-wrap ${svgClass}" data-sigil-mask="${paramsAttr}" data-sigil-cache-key="${imageCacheKey}"${styleAttr}><svg class="sigil-mask-target" viewBox="${sigilViewBox(sigilLevel)}" preserveAspectRatio="xMidYMid meet">${uses.join('')}</svg></div>`;

        sigilMarkupCache.set(markupKey, markup);
        if (sigilMarkupCache.size > SIGIL_MARKUP_CACHE_MAX) {
            sigilMarkupCache.delete(sigilMarkupCache.keys().next().value);
        }
        return markup;
    }

    // Pull the "r, g, b" components out of a sigil_params.style "rgb(r, g, b)"
    // string, so they can be dropped into an rgba() whose alpha is animated
    // separately (see --glow-intensity in style.css).
    function rgbComponents(rgbString) {
        const match = /rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/i.exec(rgbString || '');
        return match ? `${match[1]}, ${match[2]}, ${match[3]}` : '255, 255, 255';
    }

    // Unlike the immersive page sigil (themed via var(--accent)), the cast
    // modal's sigil always uses the spell's own colors, glowing per
    // svg_html_example.html's three drop-shadows. Each drop-shadow's alpha is
    // `var(--glow-intensity)` (animated 0 -> 1 in CSS, see .cast-sigil-glow)
    // scaled to that shadow's target alpha, so the glow itself flickers/fades
    // in alongside the sigil rather than appearing instantly at full alpha.
    function buildCastSigilSvg(spell, castLevel) {
        const style = (spell.sigil_params && spell.sigil_params.style) || {};
        const color1 = style.color_1 || 'currentColor';
        const rgb2 = rgbComponents(style.color_2);
        const rgb3 = rgbComponents(style.color_3);
        const glow = (rgb, targetAlpha) => `rgba(${rgb}, calc(var(--glow-intensity) * ${targetAlpha}))`;
        const inlineStyle =
            `color:${color1};fill:${color1};stroke:${color1};` +
            'filter:' +
            `drop-shadow(0 0 5px ${glow(rgb2, 1.0)}) ` +
            `drop-shadow(0 0 20px ${glow(rgb2, 1.0)}) ` +
            `drop-shadow(0 0 100px ${glow(rgb3, 0.5)});`;
        return buildSigilSvg(spell, { level: castLevel, className: 'cast-sigil', style: inlineStyle });
    }

    // The sigil canvas is 1000x1000, but each spell level can frame a
    // tighter crop of it (see database/spells/process_params.json's
    // viewbox_per_level). With no override for a level, show the full
    // canvas; otherwise crop to a centred `size`x`size` square.
    function sigilViewBox(level) {
        const size = SIGIL_VIEWBOX_PER_LEVEL[String(level)];
        if (!size) return '0 0 1000 1000';
        const offset = (1000 - size) / 2;
        return `${offset} ${offset} ${size} ${size}`;
    }

    let immersivePages = [];
    let immersiveCurrent = 0;
    let immersiveAnimating = false;
    let immersiveLevels = [];

    function isTwoPageMode() {
        return window.innerWidth > window.innerHeight;
    }

    function alignToSpread(index) {
        return index - (index % 2);
    }

    function immersiveStep() {
        return isTwoPageMode() ? 2 : 1;
    }

    function renderImmersivePageContent(spell, showBookmarks) {
        if (!spell) {
            return '<div class="immersive-page-content immersive-page-blank"></div>';
        }
        const bookmarksHtml = showBookmarks ? (() => {
            const bookmarks = immersiveLevels.map(level => {
                const active = getLevel(spell) === level ? 'active' : '';
                return `<span class="immersive-bookmark-wrapper"><button class="immersive-bookmark ${active}" data-level="${level}">${level}</button></span>`;
            }).join('');
            return `<div class="immersive-bookmarks">${bookmarks}</div>`;
        })() : '';
        const prepared = getPrepared().includes(spell.id);
        const ritualMark = !prepared && spell.ritual ? '*' : '';
        const nameClass = prepared ? '' : 'unprepared';
        const valyrianHtml = valyrianInlineHtml(spell);
        return `
            ${bookmarksHtml}
            <div class="immersive-page-content">
                <h3 class="spell-name ${nameClass}">${escapeHtml(spell.name)}${ritualMark}</h3>
                <div class="spell-level">
                    <div class="spell-level-main">${escapeHtml(formatLevelSchool(spell))}</div>
                    ${valyrianHtml ? `<div class="spell-level-valyrian">${valyrianHtml}</div>` : ''}
                </div>
                ${metaHtml(spell)}
                <div class="immersive-sigil-wrap">${showSigilsImmersive() ? buildSigilSvg(spell) : ''}</div>
                <div class="spell-description">${spell.description}</div>
                ${spell.classes && spell.classes.length ? `<p class="spell-classes">Classes: ${escapeHtml(spell.classes.join(', '))}</p>` : ''}
            </div>
        `;
    }

    function buildImmersivePages() {
        const spells = getSpellbook().map(findSpell).filter(s => s);
        const prepared = getPrepared();
        const grouped = new Map();
        spells.forEach(spell => {
            const level = getLevel(spell);
            if (!grouped.has(level)) grouped.set(level, []);
            grouped.get(level).push(spell);
        });
        grouped.forEach(group => group.sort((a, b) => {
            const aPrep = prepared.includes(a.id);
            const bPrep = prepared.includes(b.id);
            if (aPrep !== bPrep) return aPrep ? -1 : 1;
            const aRit = a.ritual ? -1 : 1;
            const bRit = b.ritual ? -1 : 1;
            if (aRit !== bRit) return aRit - bRit;
            return a.name.localeCompare(b.name);
        }));
        immersiveLevels = Array.from(grouped.keys()).sort((a, b) => a - b);
        immersivePages = [];
        immersiveLevels.forEach(level => grouped.get(level).forEach(spell => immersivePages.push(spell)));
        immersiveCurrent = 0;
        renderImmersiveBook();
        updateImmersiveNav();
    }

    function attachImmersiveBookmarks() {
        document.querySelectorAll('.immersive-bookmark').forEach(btn => {
            btn.addEventListener('click', () => {
                const level = parseInt(btn.dataset.level);
                const idx = immersivePages.findIndex(s => getLevel(s) === level);
                if (idx !== -1) goToImmersivePage(isTwoPageMode() ? alignToSpread(idx) : idx);
            });
        });
    }

    function attachImmersiveLongPress() {
        document.querySelectorAll('.immersive-page.current').forEach(currentPage => {
            const nameEl = currentPage.querySelector('.spell-name');
            const content = currentPage.querySelector('.immersive-page-content');
            const idx = parseInt(currentPage.dataset.pageIndex, 10);
            const spell = immersivePages[idx];
            if (!nameEl || !content || !spell) return;

            setupLongPress(nameEl, () => {
                openCastModal(spell);
            }, 1000);
        });
    }

    function renderImmersiveBook() {
        const book = document.getElementById('immersive-book');
        if (!book) return;
        book.innerHTML = '';
        if (!immersivePages.length) {
            book.classList.remove('two-page');
            book.innerHTML = '<div class="immersive-page current"><div class="immersive-page-content"><h3 class="spell-name">No spells in spellbook</h3></div></div>';
            return;
        }
        if (isTwoPageMode()) {
            immersiveCurrent = alignToSpread(Math.min(immersiveCurrent, immersivePages.length - 1));
            book.classList.add('two-page');
            const leftIdx = immersiveCurrent;
            const rightIdx = leftIdx + 1;

            const leftLeaf = document.createElement('div');
            leftLeaf.className = 'immersive-leaf immersive-leaf-left';
            leftLeaf.id = 'immersive-leaf-left';
            const leftPage = document.createElement('div');
            leftPage.className = 'immersive-page current';
            leftPage.dataset.pageIndex = leftIdx;
            leftPage.innerHTML = renderImmersivePageContent(immersivePages[leftIdx], true);
            leftLeaf.appendChild(leftPage);
            book.appendChild(leftLeaf);

            const rightLeaf = document.createElement('div');
            rightLeaf.className = 'immersive-leaf immersive-leaf-right';
            rightLeaf.id = 'immersive-leaf-right';
            const rightPage = document.createElement('div');
            rightPage.className = 'immersive-page current';
            rightPage.dataset.pageIndex = rightIdx;
            rightPage.innerHTML = renderImmersivePageContent(immersivePages[rightIdx], false);
            rightLeaf.appendChild(rightPage);
            book.appendChild(rightLeaf);
        } else {
            book.classList.remove('two-page');
            [-1, 0, 1].forEach(offset => {
                const idx = immersiveCurrent + offset;
                if (idx < 0 || idx >= immersivePages.length) return;
                const page = document.createElement('div');
                page.className = `immersive-page ${offset === -1 ? 'prev' : (offset === 0 ? 'current' : 'next')}`;
                page.id = `immersive-page-${offset}`;
                page.dataset.pageIndex = idx;
                page.innerHTML = renderImmersivePageContent(immersivePages[idx], true);
                book.appendChild(page);
            });
        }
        attachImmersiveBookmarks();
        attachImmersiveLongPress();
        applySigilMasks(book);
    }

    // Only one of the two pages in a spread actually moves during a turn:
    // - Turning forward ("next"): the outgoing (current) page flips away, while the
    //   incoming page is already sitting underneath at rest, fully static.
    // - Turning backward ("prev"): the incoming page flips in from being hidden,
    //   while the outgoing (current) page stays exactly where it is, untouched,
    //   until it's covered/replaced.
    function renderImmersiveBookJump(targetIndex, direction) {
        const book = document.getElementById('immersive-book');
        if (!book) return;
        book.innerHTML = '';
        book.classList.remove('two-page');

        const outgoingPage = document.createElement('div');
        outgoingPage.className = 'immersive-page current';
        outgoingPage.dataset.pageIndex = immersiveCurrent;
        outgoingPage.dataset.role = 'outgoing';
        outgoingPage.innerHTML = renderImmersivePageContent(immersivePages[immersiveCurrent], true);
        book.appendChild(outgoingPage);

        const incomingPage = document.createElement('div');
        incomingPage.className = `immersive-page ${direction === 'next' ? 'current' : 'prev'}`;
        incomingPage.dataset.pageIndex = targetIndex;
        incomingPage.dataset.role = 'incoming';
        incomingPage.innerHTML = renderImmersivePageContent(immersivePages[targetIndex], true);
        book.appendChild(incomingPage);

        attachImmersiveBookmarks();
        applySigilMasks(book);
    }

    // Two-page mode needs a single element that physically travels across the
    // spine, like a real leaf turning over: its front face shows the outgoing
    // page (visible while it's still on its starting side), and its back face
    // (pre-rotated 180deg, backface-hidden) shows the incoming page, which only
    // becomes visible once the card has rotated past the spine and lands flat
    // on the opposite side. The two leaves underneath never move — the side the
    // card departs from keeps showing its old content until the card fully
    // covers it with a new spread on the next resize; the side the card lands
    // on already shows its new content underneath, hidden until the card's
    // front face rotates away.
    function renderImmersiveBookJumpTwoPage(targetLeftIdx, direction) {
        const book = document.getElementById('immersive-book');
        if (!book) return;
        book.innerHTML = '';
        book.classList.add('two-page');

        const currentLeftIdx = immersiveCurrent;
        const currentRightIdx = immersiveCurrent + 1;
        const targetRightIdx = targetLeftIdx + 1;

        const leftLeaf = document.createElement('div');
        leftLeaf.className = 'immersive-leaf immersive-leaf-left';
        leftLeaf.id = 'immersive-leaf-left';

        const rightLeaf = document.createElement('div');
        rightLeaf.className = 'immersive-leaf immersive-leaf-right';
        rightLeaf.id = 'immersive-leaf-right';

        const leftStaticIdx = direction === 'next' ? currentLeftIdx : targetLeftIdx;
        const leftStatic = document.createElement('div');
        leftStatic.className = 'immersive-page current';
        leftStatic.dataset.pageIndex = leftStaticIdx;
        leftStatic.innerHTML = renderImmersivePageContent(immersivePages[leftStaticIdx] || null, true);
        leftLeaf.appendChild(leftStatic);

        const rightStaticIdx = direction === 'next' ? targetRightIdx : currentRightIdx;
        const rightStatic = document.createElement('div');
        rightStatic.className = 'immersive-page current';
        rightStatic.dataset.pageIndex = rightStaticIdx;
        rightStatic.innerHTML = renderImmersivePageContent(immersivePages[rightStaticIdx] || null, false);
        rightLeaf.appendChild(rightStatic);

        const frontIdx = direction === 'next' ? currentRightIdx : currentLeftIdx;
        const backIdx = direction === 'next' ? targetLeftIdx : targetRightIdx;

        // The flip card is a direct child of the book (a sibling of both leaves,
        // not nested inside either one). Each `.immersive-leaf` establishes its
        // own 3D stacking context (transform-style: preserve-3d), so a card
        // nested inside one leaf can lose the paint-order battle against the
        // other leaf once it visually swings past the spine, even with a higher
        // z-index. Keeping it a sibling means its z-index is compared directly
        // against both leaves with no nested-context ambiguity.
        const flipCard = document.createElement('div');
        flipCard.className = 'immersive-flip-card';
        flipCard.dataset.role = 'flip-card';
        flipCard.style.top = '0';
        flipCard.style.bottom = '0';
        if (direction === 'next') {
            flipCard.style.left = '50%';
            flipCard.style.right = '0';
            flipCard.style.transformOrigin = 'left center';
        } else {
            flipCard.style.left = '0';
            flipCard.style.right = '50%';
            flipCard.style.transformOrigin = 'right center';
        }
        flipCard.style.transform = 'rotateY(0deg)';

        const front = document.createElement('div');
        front.className = 'immersive-page immersive-flip-face';
        front.dataset.pageIndex = frontIdx;
        front.style.transformOrigin = 'center center';
        front.style.transform = 'rotateY(0deg)';
        front.innerHTML = renderImmersivePageContent(immersivePages[frontIdx] || null, direction !== 'next');

        const back = document.createElement('div');
        back.className = 'immersive-page immersive-flip-face';
        back.dataset.pageIndex = backIdx;
        back.style.transformOrigin = 'center center';
        back.style.transform = 'rotateY(180deg)';
        back.innerHTML = renderImmersivePageContent(immersivePages[backIdx] || null, direction === 'next');

        flipCard.appendChild(front);
        flipCard.appendChild(back);

        book.appendChild(leftLeaf);
        book.appendChild(rightLeaf);
        book.appendChild(flipCard);

        attachImmersiveBookmarks();
        applySigilMasks(book);
    }

    function goToImmersivePage(index) {
        const twoPage = isTwoPageMode();
        if (twoPage) index = alignToSpread(index);
        if (immersiveAnimating || index < 0 || index >= immersivePages.length || index === immersiveCurrent) return;

        const duration = getFlipDurationMs();
        if (duration <= 0) {
            // Animation disabled (speed dial at max): jump straight to the
            // steady-state render, no flip card/transition involved at all.
            immersiveCurrent = index;
            renderImmersiveBook();
            updateImmersiveNav();
            return;
        }

        immersiveAnimating = true;
        const direction = index > immersiveCurrent ? 'next' : 'prev';

        if (twoPage) {
            renderImmersiveBookJumpTwoPage(index, direction);
        } else {
            renderImmersiveBookJump(index, direction);
        }
        void document.getElementById('immersive-book').offsetHeight;

        if (twoPage) {
            const flipCard = document.querySelector('.immersive-flip-card');
            if (!flipCard) {
                immersiveAnimating = false;
                return;
            }
            flipCard.style.transform = direction === 'next' ? 'rotateY(-180deg)' : 'rotateY(180deg)';
        } else {
            const outgoingPage = document.querySelector('.immersive-page[data-role="outgoing"]');
            const incomingPage = document.querySelector('.immersive-page[data-role="incoming"]');
            if (!outgoingPage || !incomingPage) {
                immersiveAnimating = false;
                return;
            }
            if (direction === 'next') {
                outgoingPage.classList.replace('current', 'turn-next');
            } else {
                incomingPage.classList.replace('prev', 'current');
            }
        }

        setTimeout(() => {
            immersiveCurrent = index;
            renderImmersiveBook();
            updateImmersiveNav();
            immersiveAnimating = false;
        }, duration);
    }

    function updateImmersiveNav() {
        const prevBtn = document.getElementById('immersive-prev');
        const nextBtn = document.getElementById('immersive-next');
        const rightmostShown = isTwoPageMode() ? Math.min(immersiveCurrent + 1, immersivePages.length - 1) : immersiveCurrent;
        if (prevBtn) prevBtn.disabled = immersiveCurrent <= 0 || immersivePages.length === 0;
        if (nextBtn) nextBtn.disabled = rightmostShown >= immersivePages.length - 1 || immersivePages.length === 0;
    }

    function setupImmersiveMode() {
        const modal = document.getElementById('immersive-modal');
        const title = document.getElementById('spellbook-title');
        const zonePrev = document.querySelector('.immersive-zone.zone-prev');
        const zoneNext = document.querySelector('.immersive-zone.zone-next');
        const zoneClose = document.querySelector('.immersive-zone.zone-close');

        if (!modal || !title) return;

        title.addEventListener('click', () => {
            buildImmersivePages();
            modal.style.display = 'flex';
            document.body.classList.add('immersive-open');
        });

        if (zonePrev) zonePrev.addEventListener('click', () => goToImmersivePage(immersiveCurrent - immersiveStep()));
        if (zoneNext) zoneNext.addEventListener('click', () => goToImmersivePage(immersiveCurrent + immersiveStep()));
        if (zoneClose) {
            zoneClose.addEventListener('click', (e) => {
                e.stopPropagation();
                modal.style.display = 'none';
                document.body.classList.remove('immersive-open');
            });
        }

        let touchStartX = 0;
        let touchStartY = 0;
        modal.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });
        modal.addEventListener('touchend', (e) => {
            const dx = e.changedTouches[0].screenX - touchStartX;
            const dy = e.changedTouches[0].screenY - touchStartY;
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
                if (dx < 0) goToImmersivePage(immersiveCurrent + immersiveStep());
                else goToImmersivePage(immersiveCurrent - immersiveStep());
            }
        }, { passive: true });

        document.addEventListener('keydown', (e) => {
            if (modal.style.display === 'none') return;
            if (e.key === 'ArrowLeft') goToImmersivePage(immersiveCurrent - immersiveStep());
            if (e.key === 'ArrowRight') goToImmersivePage(immersiveCurrent + immersiveStep());
            if (e.key === 'Escape') {
                modal.style.display = 'none';
                document.body.classList.remove('immersive-open');
            }
        });

        window.addEventListener('resize', () => {
            if (modal.style.display === 'none' || immersiveAnimating) return;
            renderImmersiveBook();
            updateImmersiveNav();
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        initSheetCharacter();
        initializeSpellbook();
        migrateSavedSpellRefs();
        setupTabs();
        renderSourceFilters();
        renderBookSourceFilters();
        renderLevelFilters();
        renderSchoolFilters();
        renderClassFilters();
        renderRitualFilters();
        renderRangeFilters();
        renderCastingTimeFilters();
        renderCatalog();
        renderSpellbook();
        renderCharSheet();
        renderSheetEditor();
        setupOptions();
        setupImmersiveMode();

        // Compiling the sigil shader and pre-warming the decoded-image cache
        // are both real work (see initSigilWebGL / prefetchPreparedSigils),
        // just not urgent — deferred off the critical rendering path so they
        // don't compete with first paint, but still done well before the
        // user's first cast rather than lazily during it.
        const idle = typeof requestIdleCallback === 'function'
            ? requestIdleCallback
            : (fn) => setTimeout(fn, 200);
        idle(() => {
            initSigilWebGL();
            prefetchPreparedSigils();
        });
    });
})();

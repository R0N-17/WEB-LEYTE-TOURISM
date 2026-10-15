/* Manage categories (admin/categories.html): list, add, rename / change icon, delete (with reassignment).
   Everything goes through api/admin/category-*.php. The server validates and de-duplicates again; this file only shows what it answers. */
(async function () {
  const admin = await Admin.guard('categories');
  if (!admin) return;
  const $ = id => document.getElementById(id), esc = Admin.esc;
  let items = [], editing = null, deleting = null;
  const formModal = new bootstrap.Modal($('formModal')), deleteModal = new bootstrap.Modal($('deleteModal'));

  async function load() {
    const res = await Admin.api('categories.php');
    const err = $('listError');
    if (!res.ok) { err.textContent = res.message || 'Could not load categories.'; err.classList.remove('d-none'); return; }
    err.classList.add('d-none');
    items = res.categories;
    $('rows').innerHTML = items.length ? items.map(c => `<tr>
      <td><div class="d-flex align-items-center gap-3"><span class="ad-cat-ico" aria-hidden="true"><i class="bi ${esc(c.icon)}"></i></span><span class="ad-name">${esc(c.label)}</span></div></td>
      <td class="d-none d-md-table-cell"><code>${esc(c.key)}</code></td>
      <td data-label="Outdoor">${c.outdoor ? '<span class="ad-chip blue">Outdoor</span>' : '<span class="text-secondary small">No</span>'}</td>
      <td data-label="Destinations" class="text-md-end">${c.count}</td>
      <td class="ad-actions">
        <button type="button" class="btn btn-outline-primary" data-act="edit" data-key="${esc(c.key)}" aria-label="Edit ${esc(c.label)}"><i class="bi bi-pencil-square" aria-hidden="true"></i><span class="ms-1">Edit</span></button>
        <button type="button" class="btn btn-outline-danger" data-act="delete" data-key="${esc(c.key)}" title="Delete" aria-label="Delete ${esc(c.label)}"><i class="bi bi-trash3" aria-hidden="true"></i></button>
      </td></tr>`).join('') : '<tr><td colspan="5"><div class="ad-empty"><i class="bi bi-tags" aria-hidden="true"></i><div class="t">No categories yet</div>Click “Add category” to create the first one.</div></td></tr>';
  }

  $('rows').addEventListener('click', e => {
    const b = e.target.closest('button[data-act]');
    const c = b && items.find(x => x.key === b.dataset.key);
    if (!c) return;
    if (b.dataset.act === 'edit') openForm(c); else openDelete(c);
  });

  /* ---------- add / edit ---------- */
  function showError(box, msg) { box.textContent = msg; box.classList.remove('d-none'); }
  function openForm(c) {
    editing = c || null;
    $('catForm').reset(); $('formError').classList.add('d-none');
    $('formTitle').textContent = c ? 'Edit category' : 'Add category';
    $('saveBtn').textContent = c ? 'Save changes' : 'Add category';
    $('cLabel').value = c ? c.label : '';
    $('cOutdoor').checked = !!(c && c.outdoor);
    $('cKeyNote').textContent = c ? `Key: ${c.key} (never changes, so nothing linked to it breaks).` : "Names can't repeat, even with different capital letters or spacing.";
    Admin.iconGrid($('cIcons'), 'cIcon', c ? c.icon : null);
    formModal.show();
    $('formModal').addEventListener('shown.bs.modal', () => $('cLabel').focus(), { once: true });
  }
  $('addBtn').addEventListener('click', () => openForm(null));

  let saving = false;   // blocks a second submit while the first is being saved
  $('catForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (saving) return;
    $('formError').classList.add('d-none');
    const label = $('cLabel').value.trim();
    if (label.length < 2) { showError($('formError'), 'Enter a category name (at least two characters).'); return; }
    const btn = $('saveBtn');
    saving = true;
    Admin.loading(btn, true, 'Saving…');
    const res = await Admin.api('category-save.php', {
      key: editing ? editing.key : '', label, icon: (document.querySelector('input[name="cIcon"]:checked') || {}).value, outdoor: $('cOutdoor').checked
    });
    saving = false;
    Admin.loading(btn, false);
    if (!res.ok) { showError($('formError'), res.message || 'Could not save. Try again.'); if (res.status === 404) load(); return; }
    formModal.hide(); Admin.toast('success', res.message); load();
  });

  /* ---------- delete ---------- */
  function openDelete(c) {
    deleting = c;
    $('deleteName').textContent = c.label; $('deleteError').classList.add('d-none');
    const others = items.filter(x => x.key !== c.key);
    const need = c.count > 0;
    $('moveWrap').classList.toggle('d-none', !need);
    if (need) {
      $('moveNote').textContent = `${c.count} destination${c.count === 1 ? ' still uses' : 's still use'} this category. ${c.count === 1 ? 'It' : 'They'} must be moved to another category first.`;
      $('moveTo').innerHTML = '<option value="">Choose a category…</option>' + others.map(o => `<option value="${esc(o.key)}">${esc(o.label)}</option>`).join('');
    }
    deleteModal.show();
  }
  $('confirmDelete').addEventListener('click', async function () {
    if (!deleting || this.disabled) return;
    const box = $('deleteError'); box.classList.add('d-none');
    const need = deleting.count > 0, moveTo = $('moveTo').value;
    if (need && !moveTo) { showError(box, 'Choose a category to move the destinations to.'); return; }
    Admin.loading(this, true, 'Deleting…');
    const res = await Admin.api('category-delete.php', { key: deleting.key, move_to: need ? moveTo : '' });
    Admin.loading(this, false);
    if (!res.ok) { showError(box, res.message || 'Could not delete. Try again.'); if (res.status === 404 || res.status === 409) load(); return; }
    deleteModal.hide(); deleting = null; Admin.toast('success', res.message); load();
  });

  await load();
})();

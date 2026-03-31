// Archive page logic

async function loadArchive() {
  const auth = await checkAuth();
  if (!auth.identified) {
    window.location.href = '/';
    return;
  }

  try {
    const data = await apiFetch('/api/quizzes');
    renderArchive(data.quizzes);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function renderArchive(quizzes) {
  const list = document.getElementById('archiveList');

  if (quizzes.length === 0) {
    list.innerHTML += '<p style="text-align:center; color: var(--text-muted);">No quizzes yet.</p>';
    return;
  }

  quizzes.forEach(q => {
    const date = new Date(q.created_at + 'Z').toLocaleDateString();
    const item = document.createElement('a');
    item.className = 'archive-item';
    item.href = `/?quiz=${q.id}`;

    item.innerHTML = `
      <div>
        <div class="quiz-title">${escapeHtml(q.title)}</div>
        <div class="quiz-meta">${date} - ${q.participantCount} participant${q.participantCount !== 1 ? 's' : ''}</div>
      </div>
      <div class="quiz-score ${q.locked ? 'locked' : ''}">
        ${q.score !== null ? q.score + '/20' : (q.locked ? 'Locked' : 'Active')}
      </div>
    `;
    list.appendChild(item);
  });
}

document.addEventListener('DOMContentLoaded', loadArchive);

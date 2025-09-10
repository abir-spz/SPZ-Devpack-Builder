// Replace with your GitHub username and repository name
const GITHUB_USERNAME = 'abir-spz';
const GITHUB_REPO_NAME = 'SPZ-Devpack-Builder';

async function getContributors() {
  const url = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO_NAME}/contributors`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const contributors = await response.json();
    displayContributors(contributors);
  } catch (error) {
    console.error('Error fetching contributors:', error);
  }
}

function displayContributors(contributors) {
  const contributorsList = document.getElementById('contributors-list');

  // Clear existing content
  contributorsList.innerHTML = '';

  contributors.forEach(contributor => {
    // Create the HTML for each contributor
    const contributorDiv = document.createElement('div');
    contributorDiv.className = 'devpack__contributor__list-item';

    contributorDiv.innerHTML = `
      <a href="${contributor.html_url}" target="_blank" class="devpack__contributor">
        <img src="${contributor.avatar_url}" alt="${contributor.login}" class="devpack__contributor__avatar">
        <h3 class="devpack__contributor__name">${contributor.login}</h3>
        <p class="devpack__contributor__contribution-count">${contributor.contributions} contributions</p>
      </a>
    `;

    contributorsList.appendChild(contributorDiv);
  });
}

// Call the function to fetch and display contributors when the page loads
getContributors();
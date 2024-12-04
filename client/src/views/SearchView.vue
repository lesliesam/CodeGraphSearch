<template>
  <div class="search-view">
    <h1>Graph Search</h1>
    <p class="api-url-display">Server API URL: {{ apiUrl }}</p>
    <form @submit.prevent="handleSearch" class="search-form">
      <div class="form-group">
        <input v-model="searchQuery" type="text" placeholder="Search..." class="form-control">
      </div>
      <div class="form-group">
        <label for="category">Category:</label>
        <select id="category" v-model="selectedCategory" class="form-control">
          <option value="path_metadata">Package</option>
          <option value="class_metadata">Class</option>
          <option value="function_metadata">Function</option>
        </select>
      </div>
      <div class="form-group">
        <button type="submit" class="btn btn-primary">Search</button>
      </div>
    </form>
    <div v-if="apiResponse" class="api-response">
      <div class="response-content" style="max-width: 800px; margin: 0 auto;">
        <pre style="white-space: pre-wrap; word-wrap: break-word;">{{ apiResponse }}</pre>
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios'

export default {
  name: 'SearchView',
  data() {
    return {
      apiUrl: localStorage.getItem('apiUrl') || 'http://localhost:8080',
      searchQuery: '',
      selectedCategory: 'Package',
      apiResponse: null
    }
  },
  methods: {
    handleSearch() {
      const apiUrl = `${this.apiUrl}/searchCodeGraph?command=queryGraph&index=${this.selectedCategory}&query=${this.searchQuery}`
      axios.get(apiUrl)
        .then(response => {
          this.apiResponse = JSON.stringify(response.data, null, 2)
        })
        .catch(error => {
          console.error('Error fetching API response:', error)
        })
    }
  }
}
</script>

<style scoped>
.search-view {
  padding: 20px;
}

.api-url-display {
  color: #666;
  font-size: 0.9em;
  margin-top: -10px;
  margin-bottom: 20px;
}

.search-form {
  max-width: 700px;
  margin: 0 auto;
  text-align: left;
}

.form-group {
  margin-bottom: 1rem;
}

.form-control {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-sizing: border-box;
}

.btn {
  display: inline-block;
  font-weight: 400;
  text-align: center;
  white-space: nowrap;
  vertical-align: middle;
  user-select: none;
  border: 1px solid transparent;
  padding: 0.375rem 0.75rem;
  font-size: 1rem;
  line-height: 1.5;
  border-radius: 0.25rem;
  transition: color 0.15s ease-in-out, background-color 0.15s ease-in-out, border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
}

.btn-primary {
  color: #fff;
  background-color: #007bff;
  border-color: #007bff;
}

.btn-primary:hover {
  color: #fff;
  background-color: #0069d9;
  border-color: #0062cc;
}

.api-response {
  margin-top: 1rem;
  background-color: #f8f9fa;
  padding: 1rem;
  border-radius: 0.25rem;
}

.response-content {
  max-width: 800px;
  margin: 0 auto;
}
</style>

<template>
  <div class="create-view">
    <h1>Graph Search Create</h1>
    <p class="api-url-display">Server API URL: {{ apiUrl }}</p>
    <form @submit.prevent="handleSubmit" class="analysis-form">
      <div v-if="isLoading" class="loading-spinner">
        <div class="spinner"></div>
        <p>Processing request...</p>
      </div>
      <div class="form-group">
        <label for="githubUrl">Github URL:</label>
        <input type="text" id="githubUrl" v-model="formData.githubUrl" placeholder="Enter Github URL" required>
      </div>

      <div class="form-group">
        <label for="branchName">Branch Name:</label>
        <input type="text" id="branchName" v-model="formData.branchName" placeholder="Enter Branch Name" required>
      </div>

      <div class="form-group">
        <label for="scanFolder">Scan Folder (optional):</label>
        <input type="text" id="scanFolder" v-model="formData.scanFolder" placeholder="Enter scan folder path">
      </div>

      <div class="form-group">
        <label for="bedrockPauseTime">Bedrock Pause Time:</label>
        <input type="number" id="bedrockPauseTime" v-model="formData.bedrockPauseTime" placeholder="2500">
      </div>

      <div class="checkbox-group">
        <h3>Analysis Options:</h3>
        <div class="checkbox-item">
          <input type="checkbox" id="class" v-model="formData.options.class">
          <label for="class">Class</label>
        </div>

        <div class="checkbox-item">
          <input type="checkbox" id="function" v-model="formData.options.function">
          <label for="function">Function</label>
        </div>

        <div class="checkbox-item">
          <input type="checkbox" id="interface" v-model="formData.options.interface">
          <label for="interface">Interface</label>
        </div>

        <div class="checkbox-item">
          <input type="checkbox" id="variable" v-model="formData.options.variable">
          <label for="variable">Variable</label>
        </div>
      </div>

      <div class="form-group">
        <label for="fileMatch">File Match:</label>
        <input type="text" id="fileMatch" v-model="formData.fileMatch" placeholder="*/**">
      </div>

      <button type="submit" :disabled="isLoading">{{ isLoading ? 'Processing...' : 'OK' }}</button>
    </form>
  </div>
</template>

<script>
import axios from 'axios'
export default {
  name: 'CreateView',
  data() {
    return {
      isLoading: false,
      apiUrl: localStorage.getItem('apiUrl') || 'http://localhost:8080',
      formData: {
        githubUrl: '',
        branchName: '',
        options: {
          class: false,
          function: false,
          interface: false,
          variable: false
        },
        fileMatch: '*/**',
        scanFolder: '',
        bedrockPauseTime: 2500
      }
    }
  },
  methods: {
    handleSubmit() {
      if (this.isLoading) return;
      
      this.isLoading = true;
      console.log('Form submitted:', this.formData.githubUrl, this.formData.branchName);
      const apiUrl = `${this.apiUrl}/createCodeGraph?gitUrl=${this.formData.githubUrl}&branch=${this.formData.branchName}&subFolder=${this.formData.scanFolder}&bedrockAPIPauseTime=${this.formData.bedrockPauseTime}`
      
      axios.post(apiUrl)
        .then(response => {
          this.apiResponse = JSON.stringify(response.data, null, 2)
          // Reset form
          this.formData = {
            githubUrl: '',
            branchName: '',
            options: {
              class: false,
              function: false,
              interface: false,
              variable: false
            },
            fileMatch: '*/**',
            scanFolder: '',
            bedrockPauseTime: 2500
          }
        })
        .catch(error => {
          console.error('Error fetching API response:', error)
        })
        .finally(() => {
          this.isLoading = false
        })
    }
  }
}
</script>

<style scoped>
.create-view {
  padding: 20px;
}

.api-url-display {
  color: #666;
  font-size: 0.9em;
  margin-top: -10px;
  margin-bottom: 20px;
}

.analysis-form {
  max-width: 700px;
  margin: 0 auto;
  text-align: left;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: bold;
}

.form-group input[type="text"] {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-sizing: border-box;
}

.form-group input[type="number"] {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-sizing: border-box;
}

.checkbox-group {
  margin-bottom: 20px;
}

.checkbox-item {
  margin: 10px 0;
}

.checkbox-item label {
  margin-left: 8px;
}

button {
  background-color: #4CAF50;
  color: white;
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
}

button:hover {
  background-color: #45a049;
}

button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

h1 {
  margin-bottom: 30px;
}

.loading-spinner {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 5px solid #f3f3f3;
  border-top: 5px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>

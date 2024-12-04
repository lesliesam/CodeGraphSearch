<template>
  <div class="settings-view">
    <h2>Settings</h2>
    <form @submit.prevent="saveSettings" class="settings-form">
      <div class="form-group">
        <label for="apiUrl">Server API URL</label>
        <input 
          type="text" 
          id="apiUrl" 
          v-model="apiUrl" 
          placeholder="Enter API URL"
          required
        >
      </div>
      <button type="submit" class="save-button">Save Settings</button>
    </form>
  </div>
</template>

<script>
export default {
  name: 'SettingsView',
  data() {
    return {
      apiUrl: localStorage.getItem('apiUrl') || 'http://localhost:8080'
    }
  },
  methods: {
    saveSettings() {
      localStorage.setItem('apiUrl', this.apiUrl)
      alert('Settings saved successfully!')
    }
  }
}
</script>

<style scoped>
.settings-view {
  padding: 20px;
  max-width: 600px;
}

.settings-form {
  margin-top: 20px;
}

.form-group {
  margin-bottom: 20px;
}

label {
  display: block;
  margin-bottom: 8px;
  font-weight: bold;
}

input {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.save-button {
  background-color: #2c3e50;
  color: white;
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.save-button:hover {
  background-color: #34495e;
}
</style>

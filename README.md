# PersonalAI Tracking Dashboard

Build this app using the HTML files referenced below. You can hotlink the images referenced in the HTML. The attached images are screenshots of the desired screens. 

This app is designed to connect to my Instinct personal AI assistant and provide a central dashboard for tracking every task I've asked it to perform.

Build the app using the supplied HTML files and screenshots as the design reference.

Under Settings, implement a fully functional MCP integration that allows my Instinct AI assistant to connect securely to the app.

Requirements:

1. Create an MCP server with the tools needed for Instinct to create, read, update, complete and manage tasks.

2. Provide a Settings → MCP Integration page where I can generate, copy, revoke and regenerate authentication credentials.

3. Display the MCP server URL and clear, copyable connection instructions for Instinct.

4. Support secure authentication and protect all credentials.

5. Enable Instinct to automatically create tasks when I give it instructions, update their status as work progresses, and mark them complete when finished.

6. Capture task descriptions, creation dates, status, progress updates, completion dates and relevant notes or results.

7. Synchronise changes between Instinct and the dashboard so task information stays current.

8. Provide a connection status indicator and a Test Connection button.

9. Ensure Instinct can retrieve existing tasks to avoid duplicates and maintain continuity.

10. Make the integration functional end to end, not just a visual interface.

The objective is to give me a reliable, continuously updated overview of everything I've asked Instinct to do, what it's currently working on, what's waiting and what's been completed.

Preserve the supplied UI design while implementing the backend, database and MCP functionality needed to make this work.
Here are public links to the html of the screens which you should read and use to build the app:

1. https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1ZTY1ZmM3N2Y0ZDgwNDRmNTZkZGYwMDQxMmQ0EgsSBxCFx86IqAkYAZIBIwoKcHJvamVjdF9pZBIVQhM4ODcxODMwNTM1MDQ4NzUwMzY0&filename=&opi=89354086
2. https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1ZTY1ZmQxMjVlNTEwMjNiY2YyNzlhMmJiMjRjEgsSBxCFx86IqAkYAZIBIwoKcHJvamVjdF9pZBIVQhM4ODcxODMwNTM1MDQ4NzUwMzY0&filename=&opi=89354086
3. https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1ZTY1ZmQzNTZjNTcwNDRmNTkxOTIwMWM1ZGRmEgsSBxCFx86IqAkYAZIBIwoKcHJvamVjdF9pZBIVQhM4ODcxODMwNTM1MDQ4NzUwMzY0&filename=&opi=89354086
4. https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ7Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpaCiVodG1sXzAwMDY1ZTY1ZmQ3YjQ2NGEwNWYxMDJmMWMwMjhlZjFkEgsSBxCFx86IqAkYAZIBIwoKcHJvamVjdF9pZBIVQhM4ODcxODMwNTM1MDQ4NzUwMzY0&filename=&opi=89354086

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://instinct-task-compass.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4022d751-a5a3-4ee8-81fe-d828342b4278).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

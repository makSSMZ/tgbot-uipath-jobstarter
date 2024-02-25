import fetch from 'node-fetch';

class HTTPResponseError extends Error {
    constructor(response) {
        super(`HTTP Error Response: ${response.status} ${response.statusText}`);
        this.response = response;
    }
}

//Function to generate a token for requests to the Orchestrator
export async function getToken(prevToken) {
    const checkToken = await checkTokenIsActive(prevToken);
    if (checkToken) {
        console.log("Token is active");
        return prevToken;
    } else {
        const body = {
            tenancyName: process.env.tenancyName,
            usernameOrEmailAddress: process.env.orchusername,
            password: process.env.pass
        }

        const checkStatus = async response => {
            if (response.ok) {
                const data = await response.json();
                console.log(data.result);
                return data.result
            } else {
                throw new HTTPResponseError(response);
            }
        }

        const response = await fetch(`${process.env.orchUrl}/api/Account/Authenticate`, {
            method: 'post',
            body: JSON.stringify(body),
            headers: {
                'accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        try {
            return await checkStatus(response);
        } catch (error) {
            console.error(error);
            const errorBody = await error.response.text();
            console.error(`Error body: ${errorBody}`);
        }

    }

};

//Function that starts a job into the orchestrator
export async function startProcess(processId, token, processName, ctx, generalChatId) {
    if (await checkRBTisWorking(processName, token) == false) {
        const body = {
            startInfo: {
                ReleaseKey: processId,
                Strategy: 'All'
            }
        }

        const response = await fetch(`${process.env.orchUrl}/odata/Jobs/UiPath.Server.Configuration.OData.StartJobs`, {
            method: 'post',
            body: JSON.stringify(body),
            headers: {
                'accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            }
        });
        const data = await response.json();

        console.log(data.value[0].Key);
        if (generalChatId != 0) {
            ctx.telegram.sendMessage(generalChatId, `Робот ${processName} запущен пользователем ${ctx.callbackQuery.from.username}`)
        }
        ctx.telegram.sendMessage(ctx.callbackQuery.message.chat.id, `Робот ${processName} запущен`)

        return data.value[0].Key;
    } else {
        if (generalChatId != 0) {
            ctx.telegram.sendMessage(generalChatId, `Пользователь ${ctx.callbackQuery.from.username} хочет запустить робота ${processName}, но процесс уже работает.`)
        }
        ctx.telegram.sendMessage(ctx.callbackQuery.message.chat.id, `Робот ${processName} уже работает`)
        return 0;
    }

};

//Get process key using process name
export async function getProcessID(processName, token) {
    const checkStatus = async response => {
        if (response.ok) {
            const data = await response.json();
            console.log(data.value[0].Key);
            return data.value[0].Key
        } else {
            throw new HTTPResponseError(response);
        }
    }

    const response = await fetch(`${process.env.orchUrl}/odata/Releases?$filter=Name eq '${processName}'`, {
        method: 'get',
        headers: {
            'accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        }
    });

    try {
        return await checkStatus(response);
    } catch (error) {
        const errorBody = await error.response.text();
        console.error(`Error body: ${errorBody}`);
    }

};

//Checking if the robot that needs to be launched is already running
export async function checkRBTisWorking(processName, token) {
    const response = await fetch(`${process.env.orchUrl}/odata/Jobs?$filter=(State eq 'Running' or State eq 'Pending') and ReleaseName eq '${processName}'&orderby=StartTime desc`, {
        method: 'get',
        headers: {
            'accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        }
    });
    const data = await response.json();

    if (data.value.length > 0) {
        return true
    } else {
        return false
    }


};

//Checking the status of a running job
export async function getJobStatus(processKey, token) {
    const response = await fetch(`${process.env.orchUrl}/odata/Jobs?$filter=Key eq ${processKey}`, {
        method: 'get',
        headers: {
            'accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        }
    });
    const data = await response.json();
    return data.value[0].State

};

//
export async function getRobotID(robotName, token) {
    const response = await fetch(`${process.env.orchUrl}/odata/Robots?$filter=Name%20eq%20'${robotName}'`, {
        method: 'get',
        headers: {
            'accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        }
    });
    const data = await response.json();
    return data.value[0].id

};

export async function checkTokenIsActive(token) {
    const response = await fetch(`${process.env.orchUrl}/odata/Users/UiPath.Server.Configuration.OData.GetCurrentPermissions`, {
        method: 'get',
        headers: {
            'accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        }
    });
    const data = await response.json();
    if (data.UserId == null) {
        return false
    } else {
        return true
    }
};
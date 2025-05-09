let form = document.getElementById("form");
  const submitBtn = document.getElementById("submit-btn");
  
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const selectedConnectors = [{
        url: ":8880/users",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Basic " + btoa("admin:admin"),
        },
      }];
  
    await formHandler(e, form, submitBtn, selectedConnectors);
  });
  